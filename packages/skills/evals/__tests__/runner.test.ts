// SPDX-License-Identifier: BUSL-1.1
// Licensed under the Business Source License 1.1 (see LICENSE); Change Date: four years from publication; Change License: Apache-2.0
// Copyright (c) 2026 Empower Agile
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import type { QuotaSpendRow } from "../quota.js";
import {
  caseFixtureSpec,
  HarnessError,
  parseArgs,
  productionDeps,
  type RunArgs,
  type RunnerDeps,
  regeneratePromotionInPlace,
  resolveCaseDir,
  resolveFixturePath,
  runAgentStep,
  runGrader,
  runTrials,
} from "../runner.js";

const SAMPLE_QUOTA = (allowance: number) => `# Sporadic eval quota

## Allowance

| platform | plan tier | weekly allowance |
|---|---|---|
| codex | basic | ${allowance} |
| gemini | not installed | 0 |

## Spend log

| date | platform | skill | case | week |
|---|---|---|---|---|
`;

interface FakeState {
  ledgerRows: Record<string, unknown>[];
  quotaSpend: QuotaSpendRow[];
  promotionCalls: number;
  agentCalls: Array<{ command: string; args: readonly string[]; cwd: string }>;
  graderCalls: Array<{ command: string; args: readonly string[]; cwd: string }>;
  cleanedUp: string[];
}

function makeState(): FakeState {
  return {
    ledgerRows: [],
    quotaSpend: [],
    promotionCalls: 0,
    agentCalls: [],
    graderCalls: [],
    cleanedUp: [],
  };
}

function makeArgs(overrides: Partial<RunArgs> = {}): RunArgs {
  return {
    skill: "narrativetrace-doctor",
    caseName: "happy-path",
    platform: "claude",
    model: "haiku",
    trials: 1,
    ...overrides,
  };
}

function makeDeps(
  state: FakeState,
  overrides: Partial<RunnerDeps> = {},
  allowance = 4,
): RunnerDeps {
  return {
    evalsDir: "/fake/evals",
    packageRoot: "/fake",
    repoRoot: "/fake/repo",
    ledgerPath: "/fake/ledger/runs.jsonl",
    quotaPath: "/fake/ledger/quota.md",
    now: () => new Date("2026-09-08T10:00:00.000Z"),
    exists: (path) => !path.endsWith("case.json"),
    readFile: (path) => {
      if (path.endsWith("quota.md")) return SAMPLE_QUOTA(allowance);
      return "the prompt";
    },
    spawnAgent: (command, args, cwd) => {
      state.agentCalls.push({ command, args, cwd });
    },
    spawnGrader: (command, args, cwd) => {
      state.graderCalls.push({ command, args, cwd });
    },
    scaffoldFixture: (dir) => `/scratch/${dir.split("/").pop()}`,
    cleanupScratch: (dir) => {
      state.cleanedUp.push(dir);
    },
    appendLedgerRow: (_path, row) => {
      state.ledgerRows.push(row);
    },
    appendQuotaSpend: (_path, row) => {
      state.quotaSpend.push(row);
    },
    assertTiersGreen: () => {
      throw new Error("assertTiersGreen should not be called unless overridden");
    },
    regeneratePromotion: () => {
      state.promotionCalls++;
    },
    ...overrides,
  };
}

describe("caseFixtureSpec / resolveFixturePath — defect #1 (fixture resolved off the wrong root)", () => {
  it("defaults to the repo-root-relative canonical fixture when no case.json exists", () => {
    const spec = caseFixtureSpec("/fake/evals", "narrativetrace-doctor", "happy-path", {
      exists: () => false,
      readFile: () => {
        throw new Error("should not read a manifest that doesn't exist");
      },
    });
    expect(spec).toEqual({ relativePath: "examples/sixty-seconds", root: "repo" });
    expect(resolveFixturePath("/repo", "/repo/packages/skills", spec)).toBe(
      "/repo/examples/sixty-seconds",
    );
  });

  it("resolves a case.json fixture against the PACKAGE root, not the repo root", () => {
    const spec = caseFixtureSpec("/fake/evals", "add-narrative-tracing", "happy-path", {
      exists: () => true,
      readFile: () => JSON.stringify({ fixture: "evals/fixtures/empty-project" }),
    });
    expect(spec).toEqual({ relativePath: "evals/fixtures/empty-project", root: "package" });
    expect(resolveFixturePath("/repo", "/repo/packages/skills", spec)).toBe(
      "/repo/packages/skills/evals/fixtures/empty-project",
    );
  });

  it("REGRESSION: the real add-narrative-tracing/happy-path fixture resolves to a path that exists on disk", () => {
    const evalsDir = join(import.meta.dirname, "..");
    const packageRoot = join(evalsDir, "..");
    const repoRoot = join(evalsDir, "..", "..", "..");
    const spec = caseFixtureSpec(evalsDir, "add-narrative-tracing", "happy-path", {
      exists: existsSync,
      readFile: (path) => readFileSync(path, "utf-8"),
    });
    const resolved = resolveFixturePath(repoRoot, packageRoot, spec);
    // Under the old (broken) resolution — always against repoRoot — this path did not exist:
    // `<repoRoot>/evals/fixtures/empty-project` is not a real directory.
    expect(existsSync(resolved)).toBe(true);
  });
});

describe("resolveCaseDir — never process.cwd()", () => {
  it("joins evalsDir + skill + case, deriving nothing from process.cwd()", () => {
    // Not `process.cwd()` itself, deliberately: chdir() throws inside a worker thread (this
    // suite also runs there under Stryker's vitest runner) and would prove nothing a pure-join
    // assertion doesn't already — resolveCaseDir takes evalsDir as a parameter and never reads
    // process.cwd() at all, so its result cannot vary with whatever the real cwd happens to be.
    const fakeEvalsDir = "/definitely/not/process/cwd/evals";
    expect(resolveCaseDir(fakeEvalsDir, "narrativetrace-doctor", "happy-path")).toBe(
      "/definitely/not/process/cwd/evals/narrativetrace-doctor/happy-path",
    );
  });
});

describe("runGrader", () => {
  it("returns pass when the grader script exits zero", () => {
    expect(
      runGrader(
        "/case",
        "/scratch",
        () => {},
        () => true,
      ),
    ).toBe("pass");
  });

  it("spawns exactly `sh <caseDir>/graders/verify.sh` in the given cwd", () => {
    const calls: Array<{ command: string; args: readonly string[]; cwd: string }> = [];
    runGrader(
      "/case",
      "/scratch",
      (command, args, cwd) => calls.push({ command, args, cwd }),
      () => true,
    );
    expect(calls).toEqual([{ command: "sh", args: ["/case/graders/verify.sh"], cwd: "/scratch" }]);
  });

  it("returns fail when the grader script exits nonzero", () => {
    const spawn = () => {
      throw new Error("exit 1");
    };
    expect(runGrader("/case", "/scratch", spawn, () => true)).toBe("fail");
  });

  it("throws HarnessError (never a silent fail) when the grader script itself is missing", () => {
    expect(() =>
      runGrader(
        "/case",
        "/scratch",
        () => {},
        () => false,
      ),
    ).toThrow(HarnessError);
  });
});

describe("runAgentStep", () => {
  it("spawns the platform preset argv with the prompt as one element", () => {
    const calls: Array<{ command: string; args: readonly string[]; cwd: string }> = [];
    runAgentStep(
      makeArgs({ platform: "claude", model: "haiku" }),
      "hello `world`",
      "/scratch",
      (command, args, cwd) => calls.push({ command, args, cwd }),
    );
    expect(calls).toHaveLength(1);
    expect(calls[0]).toEqual({
      command: "claude",
      args: ["-p", "hello `world`", "--model", "haiku", "--allowed-tools", "Bash"],
      cwd: "/scratch",
    });
  });

  it("uses an explicit --agent-command override verbatim", () => {
    const calls: string[] = [];
    runAgentStep(
      makeArgs({ agentCommand: 'echo "{prompt}"' }),
      "override prompt",
      "/scratch",
      (command) => calls.push(command),
    );
    expect(calls).toEqual(["echo"]);
  });

  it("skips the agent step (no spawn) when --agent-command resolves empty", () => {
    let called = false;
    runAgentStep(makeArgs({ agentCommand: "" }), "prompt", "/scratch", () => {
      called = true;
    });
    expect(called).toBe(false);
  });

  it("throws HarnessError when the template tokenises to an empty argv", () => {
    expect(() =>
      runAgentStep(makeArgs({ agentCommand: "   " }), "p", "/scratch", () => {}),
    ).toThrow(HarnessError);
  });
});

describe("runTrials — no such case", () => {
  it("throws before scaffolding anything when the case has no prompt.md", () => {
    const state = makeState();
    const deps = makeDeps(state, { exists: () => false });
    expect(() => runTrials(makeArgs({ caseName: "does-not-exist" }), deps)).toThrow(
      /No case found at/,
    );
    expect(state.ledgerRows).toEqual([]);
  });

  it("checks existence of exactly <evalsDir>/<skill>/<case>/prompt.md", () => {
    const state = makeState();
    const checked: string[] = [];
    const deps = makeDeps(state, {
      evalsDir: "/fake/evals",
      exists: (path) => {
        checked.push(path);
        return false;
      },
    });
    expect(() => runTrials(makeArgs(), deps)).toThrow();
    expect(checked).toContain("/fake/evals/narrativetrace-doctor/happy-path/prompt.md");
  });
});

describe("runTrials — pass/fail/crash", () => {
  it("a passing trial appends a ledger row with no note, cleans up, and regenerates the promotion matrix", () => {
    const state = makeState();
    runTrials(makeArgs(), makeDeps(state));
    expect(state.ledgerRows).toEqual([
      {
        date: "2026-09-08T10:00:00.000Z",
        skill: "narrativetrace-doctor",
        case: "happy-path",
        platform: "claude",
        model: "haiku",
        trial: 1,
        result: "pass",
      },
    ]);
    expect(state.promotionCalls).toBe(1);
    expect(state.cleanedUp).toHaveLength(1);
  });

  it("a grader nonzero exit records result fail, with no note", () => {
    const state = makeState();
    const deps = makeDeps(state, {
      spawnGrader: () => {
        throw new Error("exit 1");
      },
    });
    runTrials(makeArgs(), deps);
    expect(state.ledgerRows[0]).toMatchObject({ result: "fail" });
    expect(state.ledgerRows[0]?.note).toBeUndefined();
  });

  it("an agent crash is caught, recorded fail, and noted as an agent crash (not a harness bug)", () => {
    const state = makeState();
    const deps = makeDeps(state, {
      spawnAgent: () => {
        throw new Error("agent CLI exited 127");
      },
    });
    runTrials(makeArgs(), deps);
    expect(state.ledgerRows[0]?.result).toBe("fail");
    expect(state.ledgerRows[0]?.note).toBe("agent crashed: agent CLI exited 127");
    // The agent crash must not crash the whole runner — the grader is never reached, but a row lands.
    expect(state.graderCalls).toHaveLength(0);
  });

  it("a missing grader script is recorded fail and noted as a harness bug", () => {
    const state = makeState();
    const deps = makeDeps(state, {
      exists: (path) => !path.endsWith("case.json") && !path.endsWith("verify.sh"),
    });
    runTrials(makeArgs(), deps);
    expect(state.ledgerRows[0]?.result).toBe("fail");
    expect(state.ledgerRows[0]?.note).toMatch(/^harness: grader script not found/);
  });
});

describe("runTrials — the sporadic-lane refusals and Claude's exemption", () => {
  it("Claude never checks Tier A/A2 and never spends quota", () => {
    const state = makeState();
    const deps = makeDeps(state, {
      readFile: (path) => {
        if (path.endsWith("quota.md"))
          throw new Error("quota.md should never be read for the claude lane");
        return "the prompt";
      },
    });
    runTrials(makeArgs({ platform: "claude" }), deps);
    expect(state.quotaSpend).toEqual([]);
  });

  it("a codex trial checks Tier A/A2 first and refuses before any trial runs when it is red", () => {
    const state = makeState();
    const deps = makeDeps(state, {
      assertTiersGreen: () => {
        throw new Error("Tier A/A2 not green at HEAD");
      },
    });
    expect(() => runTrials(makeArgs({ platform: "codex" }), deps)).toThrow(/not green/);
    expect(state.ledgerRows).toEqual([]);
  });

  it("a codex trial refuses when the weekly allowance is already spent, with no ledger row", () => {
    const state = makeState();
    const deps = makeDeps(state, { assertTiersGreen: () => {} }, 0);
    expect(() => runTrials(makeArgs({ platform: "codex" }), deps)).toThrow(/no override/);
    expect(state.ledgerRows).toEqual([]);
  });

  it("a codex run spends its allowance across trials and refuses the trial that would exceed it", () => {
    const state = makeState();
    const deps = makeDeps(state, { assertTiersGreen: () => {} }, 2);
    expect(() => runTrials(makeArgs({ platform: "codex", trials: 3 }), deps)).toThrow(
      /no override/,
    );
    expect(state.ledgerRows).toHaveLength(2);
    expect(state.quotaSpend).toHaveLength(2);
  });

  it("a successful codex trial appends both a ledger row and a quota-spend row", () => {
    const state = makeState();
    const deps = makeDeps(state, { assertTiersGreen: () => {} }, 4);
    runTrials(makeArgs({ platform: "codex" }), deps);
    expect(state.ledgerRows).toHaveLength(1);
    expect(state.quotaSpend).toEqual([
      {
        date: "2026-09-08T10:00:00.000Z",
        platform: "codex",
        skill: "narrativetrace-doctor",
        caseName: "happy-path",
        week: "2026-W37",
      },
    ]);
  });
});

describe("runTrials — multi-trial numbering and a week-boundary quota case", () => {
  it("numbers trials 1..N in order on a lane with no quota", () => {
    const state = makeState();
    runTrials(makeArgs({ trials: 2 }), makeDeps(state));
    expect(state.ledgerRows.map((r) => r.trial)).toEqual([1, 2]);
  });

  // Noon UTC on each date, deliberately far from local-midnight, so the assertion holds
  // regardless of the test runner's own timezone (release rule: wall-clock is never a fuzzy
  // test input) — each call uses the runner's OWN injected clock, not a value cached at the
  // start of the run, so the two trials below land in different ISO weeks even though they
  // come from the very same `runTrials` call shape.
  it("records a trial's spend under that trial's own ISO week (2026-W37)", () => {
    const state = makeState();
    const deps = makeDeps(
      state,
      { assertTiersGreen: () => {}, now: () => new Date("2026-09-08T12:00:00.000Z") },
      4,
    );
    runTrials(makeArgs({ platform: "codex" }), deps);
    expect(state.quotaSpend[0]?.week).toBe("2026-W37");
  });

  it("records the following week's trial under the NEXT ISO week (2026-W38), not a cached one", () => {
    const state = makeState();
    const deps = makeDeps(
      state,
      { assertTiersGreen: () => {}, now: () => new Date("2026-09-15T12:00:00.000Z") },
      4,
    );
    runTrials(makeArgs({ platform: "codex" }), deps);
    expect(state.quotaSpend[0]?.week).toBe("2026-W38");
  });
});

describe("parseArgs", () => {
  it("parses the required flags and defaults trials to 1 with no --agent-command", () => {
    const args = parseArgs([
      "--skill",
      "narrativetrace-doctor",
      "--case",
      "happy-path",
      "--platform",
      "claude",
      "--model",
      "haiku",
    ]);
    expect(args).toEqual({
      skill: "narrativetrace-doctor",
      caseName: "happy-path",
      platform: "claude",
      model: "haiku",
      agentCommand: undefined,
      trials: 1,
    });
  });

  it("parses --trials and an explicit --agent-command", () => {
    const args = parseArgs([
      "--skill",
      "s",
      "--case",
      "c",
      "--platform",
      "codex",
      "--model",
      "mini",
      "--trials",
      "3",
      "--agent-command",
      "echo {prompt}",
    ]);
    expect(args.trials).toBe(3);
    expect(args.agentCommand).toBe("echo {prompt}");
  });

  it("throws a usage error when a required flag is missing", () => {
    expect(() => parseArgs(["--skill", "s"])).toThrow(/Usage:/);
  });

  it("throws a usage error for an unknown platform", () => {
    expect(() =>
      parseArgs(["--skill", "s", "--case", "c", "--platform", "mistral", "--model", "m"]),
    ).toThrow(/Usage:/);
  });
});

describe("productionDeps", () => {
  it("derives the package root, repo root, and ledger/quota paths from evalsDir alone", () => {
    const deps = productionDeps("/repo/packages/skills/evals");
    expect(deps.evalsDir).toBe("/repo/packages/skills/evals");
    expect(deps.packageRoot).toBe("/repo/packages/skills");
    expect(deps.repoRoot).toBe("/repo");
    expect(deps.ledgerPath).toBe("/repo/packages/skills/ledger/runs.jsonl");
    expect(deps.quotaPath).toBe("/repo/packages/skills/ledger/quota.md");
  });
});

describe("regeneratePromotionInPlace", () => {
  it("runs `pnpm run promotion-render` rooted at repoRoot, keeping the drift check honest", () => {
    const calls: Array<{ command: string; args: readonly string[]; cwd: string }> = [];
    regeneratePromotionInPlace("/repo", (command, args, cwd) => calls.push({ command, args, cwd }));
    expect(calls).toEqual([{ command: "pnpm", args: ["run", "promotion-render"], cwd: "/repo" }]);
  });
});
