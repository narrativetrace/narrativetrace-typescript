// SPDX-License-Identifier: BUSL-1.1
// Licensed under the Business Source License 1.1 (see LICENSE); Change Date: four years from publication; Change License: Apache-2.0
// Copyright (c) 2026 Empower Agile
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it, vi } from "vitest";
import type { QuotaSpendRow } from "../quota.js";
import {
  CaseSetupError,
  caseFixtureSpec,
  caseRegistry,
  cliBinEnv,
  HarnessError,
  parseArgs,
  productionDeps,
  RegistryPreStepError,
  type RunArgs,
  type RunnerDeps,
  regeneratePromotionInPlace,
  resolveCaseDir,
  resolveFixturePath,
  runAgentTurn,
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

interface SpawnRecord {
  command: string;
  args: readonly string[];
  cwd: string;
  env?: Readonly<Record<string, string>> | undefined;
  stdoutTo?: string | undefined;
}

interface FakeState {
  ledgerRows: Record<string, unknown>[];
  quotaSpend: QuotaSpendRow[];
  promotionCalls: number;
  agentCalls: SpawnRecord[];
  graderCalls: SpawnRecord[];
  preStepCalls: SpawnRecord[];
  workDirs: string[];
  seededLogins: string[];
  cleanedUp: string[];
  standIns: string[];
  /** Every event in the order it happened: `turn N`, `agent`, `grader`, `kept <dir>`. */
  events: string[];
}

function makeState(): FakeState {
  return {
    ledgerRows: [],
    quotaSpend: [],
    promotionCalls: 0,
    agentCalls: [],
    graderCalls: [],
    preStepCalls: [],
    workDirs: [],
    seededLogins: [],
    cleanedUp: [],
    standIns: [],
    events: [],
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
    spawnAgent: (command, args, cwd, env, stdoutTo) => {
      state.agentCalls.push({ command, args, cwd, env, stdoutTo });
      state.events.push("agent");
    },
    spawnGrader: (command, args, cwd, env) => {
      state.graderCalls.push({ command, args, cwd, env });
      state.events.push("grader");
    },
    spawnPreStep: (command, args, cwd, env) => {
      state.preStepCalls.push({ command, args, cwd, env });
    },
    scaffoldFixture: (dir) => `/scratch/${dir.split("/").pop()}`,
    makeWorkDir: () => {
      const dir = `/work/trial-${state.workDirs.length + 1}`;
      state.workDirs.push(dir);
      return dir;
    },
    seedVendorLogin: (workDir) => {
      state.seededLogins.push(workDir);
      return true;
    },
    installStandIns: (workDir) => {
      state.standIns.push(workDir);
    },
    recordUserTurn: (_workDir, turn, text) => {
      state.events.push(`turn ${turn}: ${text}`);
    },
    keepEvidence: (_workDir, destination) => {
      state.events.push(`kept ${destination}`);
    },
    evidenceRoot: "/fake/.evals-evidence",
    ambientPath: "/usr/bin",
    newSessionId: () => "0f8fad5b-d9cb-469f-a165-70867728950e",
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
    listPackageDirs: () => ["cli"],
    startRegistry: (tarballDir, npmrcPath) => {
      state.events.push(`registry up: ${tarballDir} -> ${npmrcPath}`);
      return () => state.events.push("registry down");
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
    expect(resolveFixturePath("/repo", "/repo/packages/skills-catalogue", spec)).toBe(
      "/repo/examples/sixty-seconds",
    );
  });

  it("resolves a case.json fixture against the PACKAGE root, not the repo root", () => {
    const spec = caseFixtureSpec("/fake/evals", "add-narrative-tracing", "happy-path", {
      exists: () => true,
      readFile: () => JSON.stringify({ fixture: "evals/fixtures/empty-project" }),
    });
    expect(spec).toEqual({ relativePath: "evals/fixtures/empty-project", root: "package" });
    expect(resolveFixturePath("/repo", "/repo/packages/skills-catalogue", spec)).toBe(
      "/repo/packages/skills-catalogue/evals/fixtures/empty-project",
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

describe("caseFixtureSpec / caseRegistry — a manifest nobody can act on", () => {
  const manifest = (body: string) => ({
    exists: () => true,
    readFile: () => body,
  });

  it("refuses a fixture that is not a non-empty string, naming the file and what it found", () => {
    for (const body of ['{"registry":"npx-skills"}', '{"fixture":null}', '{"fixture":123}']) {
      expect(() =>
        caseFixtureSpec("/evals", "add-narrative-tracing", "broken", manifest(body)),
      ).toThrow(HarnessError);
      expect(() =>
        caseFixtureSpec("/evals", "add-narrative-tracing", "broken", manifest(body)),
      ).toThrow(/\/evals\/add-narrative-tracing\/broken\/case\.json/);
    }
  });

  // The one that is not merely a bad message: `join(packageRoot, "")` is the PACKAGE ROOT, so an
  // empty fixture scaffolded this whole package as the project under test and graded a tree nobody
  // meant. Every other bad shape at least reached a thrown path error.
  it("refuses an EMPTY fixture, which would otherwise scaffold the package root itself", () => {
    expect(() =>
      caseFixtureSpec("/evals", "add-narrative-tracing", "broken", manifest('{"fixture":""}')),
    ).toThrow(/must name its fixture/);
  });

  it("refuses a fixture of nothing but whitespace, which names no directory either", () => {
    expect(() =>
      caseFixtureSpec("/evals", "add-narrative-tracing", "broken", manifest('{"fixture":"   "}')),
    ).toThrow(/must name its fixture/);
  });

  it("refuses a registry that is not a string at all, the same way as an unknown id", () => {
    for (const body of ['{"registry":null}', '{"registry":7}', '{"registry":["npx-skills"]}']) {
      expect(() =>
        caseRegistry("/evals", "add-narrative-tracing", "broken", manifest(body)),
      ).toThrow(/not one of claude-marketplace, npx-skills/);
    }
  });

  it("refuses a manifest that is not readable JSON, naming the file rather than the parser", () => {
    const broken = manifest("{ fixture: evals/fixtures/empty-project }");

    expect(() => caseFixtureSpec("/evals", "add-narrative-tracing", "broken", broken)).toThrow(
      /case\.json is not readable JSON/,
    );
    expect(() => caseRegistry("/evals", "add-narrative-tracing", "broken", broken)).toThrow(
      /case\.json is not readable JSON/,
    );
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

describe("runAgentTurn", () => {
  it("spawns the template's argv with the prompt as one element, its stdout to the transcript", () => {
    const calls: SpawnRecord[] = [];
    runAgentTurn(
      'claude -p "{prompt}" --model haiku',
      "hello `world`",
      "/scratch",
      (command, args, cwd, env, stdoutTo) => calls.push({ command, args, cwd, env, stdoutTo }),
      { PATH: "/bin" },
      "/work/transcript.jsonl",
    );
    expect(calls).toEqual([
      {
        command: "claude",
        args: ["-p", "hello `world`", "--model", "haiku"],
        cwd: "/scratch",
        env: { PATH: "/bin" },
        stdoutTo: "/work/transcript.jsonl",
      },
    ]);
  });

  it("throws HarnessError when the template tokenises to an empty argv", () => {
    expect(() => runAgentTurn("   ", "p", "/scratch", () => {})).toThrow(HarnessError);
  });
});

describe("runTrials — what drives the agent", () => {
  it("uses an explicit --agent-command override verbatim", () => {
    const state = makeState();
    runTrials(makeArgs({ agentCommand: 'echo "{prompt}"' }), makeDeps(state));
    expect(state.agentCalls.map((call) => call.command)).toEqual(["echo"]);
  });

  it("skips the agent (no spawn) when --agent-command is empty, and still grades", () => {
    const state = makeState();
    runTrials(makeArgs({ agentCommand: "" }), makeDeps(state));
    expect(state.agentCalls).toEqual([]);
    expect(state.graderCalls).toHaveLength(1);
  });

  it("runs the platform preset with the prompt as one element when nothing overrides it", () => {
    const state = makeState();
    runTrials(makeArgs(), makeDeps(state));
    expect(state.agentCalls[0]?.args.slice(0, 2)).toEqual(["-p", "the prompt"]);
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
    expect(state.cleanedUp).toHaveLength(2);
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

/** Deps for a case whose `case.json` declares `registry`, the fixture beside it. */
function registryDeps(
  state: FakeState,
  registry: string,
  overrides: Partial<RunnerDeps> = {},
): RunnerDeps {
  return makeDeps(state, {
    exists: () => true,
    readFile: (path) => {
      if (path.endsWith("case.json")) {
        return JSON.stringify({ fixture: "evals/fixtures/empty-project", registry });
      }
      if (path.endsWith("quota.md")) return SAMPLE_QUOTA(4);
      return "the prompt";
    },
    ...overrides,
  });
}

/** Everything `run` printed, as one string — the operator's own view of a trial. */
function sayings(run: () => void): string {
  const lines: string[] = [];
  const log = vi.spyOn(console, "log").mockImplementation((...parts) => {
    lines.push(parts.join(" "));
  });
  try {
    run();
  } finally {
    log.mockRestore();
  }
  return lines.join("\n");
}

describe("caseRegistry — which registry delivered a case's pages", () => {
  it("is undefined for a case with no manifest at all", () => {
    expect(
      caseRegistry("/evals", "add-narrative-tracing", "happy-path", {
        exists: () => false,
        readFile: () => {
          throw new Error("should not read a manifest that doesn't exist");
        },
      }),
    ).toBeUndefined();
  });

  it("is undefined for a manifest that declares only a fixture — the ordinary arrangement", () => {
    expect(
      caseRegistry("/evals", "add-narrative-tracing", "happy-path", {
        exists: () => true,
        readFile: () => JSON.stringify({ fixture: "evals/fixtures/empty-project" }),
      }),
    ).toBeUndefined();
  });

  it("reads the declared id out of the case's own manifest", () => {
    expect(
      caseRegistry("/evals", "add-narrative-tracing", "registry-npx-skills", {
        exists: () => true,
        readFile: () => JSON.stringify({ registry: "npx-skills" }),
      }),
    ).toBe("npx-skills");
  });

  it("refuses an id outside the vocabulary, naming the file and the whole vocabulary", () => {
    expect(() =>
      caseRegistry("/evals", "add-narrative-tracing", "registry-gemini", {
        exists: () => true,
        readFile: () => JSON.stringify({ registry: "gemini-skills" }),
      }),
    ).toThrow(/case\.json.*gemini-skills.*claude-marketplace, npx-skills/s);
  });
});

describe("cliBinEnv — the grader learns where THIS checkout's CLI is", () => {
  it("names the committed bin shim under the repo root", () => {
    expect(cliBinEnv("/repo", () => true)).toEqual({
      NARRATIVETRACE_CLI_BIN: "/repo/packages/cli/bin/narrativetrace.js",
    });
  });

  it("says nothing at all when there is no such file, rather than naming a path that is not there", () => {
    expect(cliBinEnv("/repo", () => false)).toEqual({});
  });
});

describe("runTrials — every trial is isolated and recorded, not only a registry one", () => {
  it("gives an ordinary case its own work directory, stand-ins and seeded configuration", () => {
    const state = makeState();
    runTrials(makeArgs(), makeDeps(state));

    expect(state.workDirs).toEqual(["/work/trial-1"]);
    expect(state.standIns).toEqual(["/work/trial-1"]);
    expect(state.seededLogins).toEqual(["/work/trial-1"]);
    expect(state.preStepCalls).toEqual([]);
  });

  it("runs the agent against the trial's own configuration, the stand-ins first on its PATH", () => {
    const state = makeState();
    runTrials(makeArgs(), makeDeps(state));

    expect(state.agentCalls[0]?.env?.CLAUDE_CONFIG_DIR).toBe("/work/trial-1/config");
    expect(state.agentCalls[0]?.env?.PATH).toBe("/work/trial-1/bin:/usr/bin");
  });

  it("appends the agent's stdout to the transcript in the WORK directory, never the project", () => {
    const state = makeState();
    runTrials(makeArgs(), makeDeps(state));
    expect(state.agentCalls[0]?.stdoutTo).toBe("/work/trial-1/transcript.jsonl");
  });

  it("tells the grader where the evidence is, and the agent nothing about it", () => {
    const state = makeState();
    runTrials(makeArgs(), makeDeps(state));

    expect(state.graderCalls[0]?.env?.NARRATIVETRACE_TRANSCRIPT).toBe(
      "/work/trial-1/transcript.jsonl",
    );
    expect(state.graderCalls[0]?.env?.NARRATIVETRACE_GH_LOG).toBe(
      "/work/trial-1/gh-invocations.log",
    );
    expect(state.agentCalls[0]?.env?.NARRATIVETRACE_TRANSCRIPT).toBeUndefined();
    expect(state.agentCalls[0]?.env?.NARRATIVETRACE_GH_LOG).toBeUndefined();
  });

  it("deletes the work directory as well as the scratch project", () => {
    const state = makeState();
    runTrials(makeArgs(), makeDeps(state));
    expect(state.cleanedUp.sort()).toEqual(["/scratch/sixty-seconds", "/work/trial-1"]);
  });

  it("says where the isolated configuration is and that the login was seeded", () => {
    const state = makeState();
    const said = sayings(() => runTrials(makeArgs(), makeDeps(state)));
    expect(said).toContain("isolated vendor configuration under /work/trial-1/config");
    expect(said).toContain("(subscription login seeded)");
  });
});

describe("runTrials — the evidence of every trial", () => {
  it("keeps a FAILED trial's evidence under its skill, case and trial number", () => {
    const state = makeState();
    const deps = makeDeps(state, {
      spawnGrader: () => {
        throw new Error("exit 1");
      },
    });
    runTrials(makeArgs({ trials: 2 }), deps);
    expect(state.events.filter((event) => event.startsWith("kept"))).toEqual([
      "kept /fake/.evals-evidence/narrativetrace-doctor/happy-path/2026-09-08T10-00-00.000Z-trial-1",
      "kept /fake/.evals-evidence/narrativetrace-doctor/happy-path/2026-09-08T10-00-00.000Z-trial-2",
    ]);
  });

  it("never lets a later run's evidence overwrite an earlier run's — the run's time is in the path", () => {
    const state = makeState();
    const failing = {
      spawnGrader: () => {
        throw new Error("exit 1");
      },
    };
    runTrials(
      makeArgs(),
      makeDeps(state, { ...failing, now: () => new Date("2026-10-08T21:34:00.000Z") }),
    );
    runTrials(
      makeArgs(),
      makeDeps(state, { ...failing, now: () => new Date("2026-10-08T21:40:00.000Z") }),
    );
    const kept = state.events.filter((event) => event.startsWith("kept"));
    expect(new Set(kept).size).toBe(2);
  });

  // Reversed 2026-10-10 (Java cross-port item 8, "keep pass evidence"): a green row is a claim
  // too, and the demo transcript and every grader-rule question need the passing run's record.
  it("keeps a PASSING trial's evidence too, marked as a pass", () => {
    const state = makeState();
    runTrials(makeArgs(), makeDeps(state));
    expect(state.events.filter((event) => event.startsWith("kept"))).toEqual([
      "kept /fake/.evals-evidence/narrativetrace-doctor/happy-path/2026-09-08T10-00-00.000Z-trial-1-pass",
    ]);
  });

  it("keeps the evidence of an agent crash too — that red row needs reading most", () => {
    const state = makeState();
    const deps = makeDeps(state, {
      spawnAgent: () => {
        throw new Error("exit 1");
      },
    });
    runTrials(makeArgs(), deps);
    expect(state.events.at(-1)).toMatch(/^kept /);
  });
});

describe("runTrials — a registry case", () => {
  it("runs the registry's own commands in the project, in order, before the agent starts", () => {
    const state = makeState();
    runTrials(makeArgs({ caseName: "registry-npx-skills" }), registryDeps(state, "npx-skills"));

    expect(state.preStepCalls.map((call) => call.command)).toEqual(["git", "tar", "npx"]);
    expect(state.preStepCalls.every((call) => call.cwd === "/scratch/empty-project")).toBe(true);
    expect(state.agentCalls).toHaveLength(1);
  });

  it("stages the snapshot BESIDE the project, never inside it", () => {
    const state = makeState();
    runTrials(makeArgs({ caseName: "registry-npx-skills" }), registryDeps(state, "npx-skills"));

    const target = state.preStepCalls[2]?.args.at(-2) as string;
    expect(target).toBe("/work/trial-1/staged");
    expect(target.startsWith("/scratch/")).toBe(false);
  });

  it("seeds the subscription login into the trial's own configuration before any command runs", () => {
    const state = makeState();
    runTrials(
      makeArgs({ caseName: "registry-claude-marketplace" }),
      registryDeps(state, "claude-marketplace"),
    );

    expect(state.seededLogins).toEqual(["/work/trial-1"]);
    expect(state.preStepCalls.map((call) => call.command)).toEqual([
      "git",
      "tar",
      "claude",
      "claude",
      "claude",
    ]);
  });

  it("runs every command of the trial against that configuration — pre-step, agent and grader alike", () => {
    const state = makeState();
    runTrials(makeArgs({ caseName: "registry-npx-skills" }), registryDeps(state, "npx-skills"));

    for (const call of [...state.preStepCalls, ...state.agentCalls, ...state.graderCalls]) {
      expect(call.env?.CLAUDE_CONFIG_DIR).toBe("/work/trial-1/config");
    }
  });

  it("tells the grader where this checkout's CLI is, so the plan it reads is this code's plan", () => {
    const state = makeState();
    runTrials(makeArgs({ caseName: "registry-npx-skills" }), registryDeps(state, "npx-skills"));

    expect(state.graderCalls[0]?.env?.NARRATIVETRACE_CLI_BIN).toBe(
      "/fake/repo/packages/cli/bin/narrativetrace.js",
    );
  });

  // The announcement is the ONLY place an operator learns a trial is about to run logged out: the
  // agent's own answer three steps later is "Not logged in", a long way from the cause.
  it("says which registry is delivering and where the configuration it seeded is", () => {
    const state = makeState();
    const said = sayings(() =>
      runTrials(makeArgs({ caseName: "registry-npx-skills" }), registryDeps(state, "npx-skills")),
    );

    expect(said).toContain("registry pre-step: npx-skills");
    expect(said).toContain("/work/trial-1/config");
    expect(said).toContain("(subscription login seeded)");
  });

  it("runs anyway when no login was found, and SAYS the agent may refuse to start", () => {
    const state = makeState();
    const deps = registryDeps(state, "npx-skills", { seedVendorLogin: () => false });

    const said = sayings(() => runTrials(makeArgs({ caseName: "registry-npx-skills" }), deps));

    expect(said).toContain("NO login found");
    expect(said).not.toContain("(subscription login seeded)");
    expect(state.preStepCalls).toHaveLength(3);
    expect(state.ledgerRows).toHaveLength(1);
  });

  it("gives every trial its OWN configuration, so trial 2 never inherits trial 1's install", () => {
    const state = makeState();
    runTrials(
      makeArgs({ caseName: "registry-npx-skills", trials: 2 }),
      registryDeps(state, "npx-skills"),
    );

    expect(state.workDirs).toEqual(["/work/trial-1", "/work/trial-2"]);
    expect(state.seededLogins).toEqual(["/work/trial-1", "/work/trial-2"]);
    expect(state.cleanedUp).toContain("/work/trial-1");
  });
});

describe("runTrials — a failed pre-step CRASHES the trial", () => {
  it("writes no ledger row: an absent vendor tool is not a verdict about the registry path", () => {
    const state = makeState();
    const deps = registryDeps(state, "npx-skills", {
      spawnPreStep: () => {
        throw new Error("npx: command not found");
      },
    });

    expect(() => runTrials(makeArgs({ caseName: "registry-npx-skills" }), deps)).toThrow(
      /registry pre-step/,
    );
    expect(state.ledgerRows).toEqual([]);
    expect(state.promotionCalls).toBe(0);
  });

  it("never drives the agent, and still deletes both throwaway directories", () => {
    const state = makeState();
    const deps = registryDeps(state, "npx-skills", {
      spawnPreStep: () => {
        throw new Error("exit 1");
      },
    });

    expect(() => runTrials(makeArgs({ caseName: "registry-npx-skills" }), deps)).toThrow(
      RegistryPreStepError,
    );
    expect(state.agentCalls).toEqual([]);
    expect(state.graderCalls).toEqual([]);
    expect(state.cleanedUp.sort()).toEqual(["/scratch/empty-project", "/work/trial-1"]);
  });

  it("names the command that failed, so the operator reads the cause at the cause's own site", () => {
    const state = makeState();
    const deps = registryDeps(state, "claude-marketplace", {
      spawnPreStep: (command) => {
        if (command === "claude") throw new Error("not logged in");
      },
    });

    expect(() => runTrials(makeArgs({ caseName: "registry-claude-marketplace" }), deps)).toThrow(
      /claude plugin marketplace add/,
    );
  });

  it("an unknown registry id crashes before anything is scaffolded", () => {
    const state = makeState();
    const deps = registryDeps(state, "gemini-skills");

    expect(() => runTrials(makeArgs({ caseName: "registry-gemini" }), deps)).toThrow(
      /not one of claude-marketplace, npx-skills/,
    );
    expect(state.cleanedUp).toEqual([]);
    expect(state.ledgerRows).toEqual([]);
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
    const deps = productionDeps("/repo/packages/skills-catalogue/evals");
    expect(deps.evalsDir).toBe("/repo/packages/skills-catalogue/evals");
    expect(deps.packageRoot).toBe("/repo/packages/skills-catalogue");
    expect(deps.repoRoot).toBe("/repo");
    expect(deps.ledgerPath).toBe("/repo/packages/skills-catalogue/ledger/runs.jsonl");
    expect(deps.quotaPath).toBe("/repo/packages/skills-catalogue/ledger/quota.md");
  });
});

describe("regeneratePromotionInPlace", () => {
  it("runs `pnpm run promotion-render` rooted at repoRoot, keeping the drift check honest", () => {
    const calls: Array<{ command: string; args: readonly string[]; cwd: string }> = [];
    regeneratePromotionInPlace("/repo", (command, args, cwd) => calls.push({ command, args, cwd }));
    expect(calls).toEqual([{ command: "pnpm", args: ["run", "promotion-render"], cwd: "/repo" }]);
  });
});

/** A case whose `case.json` is `manifest`, its fixture's `package.json` the one given. */
function caseDeps(
  state: FakeState,
  manifest: Record<string, unknown>,
  overrides: Partial<RunnerDeps> = {},
): RunnerDeps {
  return makeDeps(state, {
    exists: () => true,
    readFile: (path) => {
      if (path.endsWith("case.json")) return JSON.stringify(manifest);
      if (path.endsWith("quota.md")) return SAMPLE_QUOTA(4);
      if (path.endsWith("/fixtures/feedback/package.json")) {
        return JSON.stringify({ devDependencies: { "@narrativetrace/cli": "latest" } });
      }
      if (path.endsWith("/packages/cli/package.json")) {
        return JSON.stringify({ name: "@narrativetrace/cli", version: "0.2.0" });
      }
      return "the prompt";
    },
    ...overrides,
  });
}

const FEEDBACK = { skill: "narrativetrace-feedback", caseName: "approval-gate-approved" };

describe("runTrials — a conversation", () => {
  const twoTurns = { fixture: "evals/fixtures/feedback", turns: { "2": "yes, file it" } };

  it("records each turn's words BEFORE that turn runs, and grades only after the last", () => {
    const state = makeState();
    runTrials(makeArgs(FEEDBACK), caseDeps(state, twoTurns));
    expect(state.events).toEqual([
      "turn 1: the prompt",
      "agent",
      "turn 2: yes, file it",
      "agent",
      "grader",
      "kept /fake/.evals-evidence/narrativetrace-feedback/approval-gate-approved/2026-09-08T10-00-00.000Z-trial-1-pass",
    ]);
  });

  it("opens the conversation in turn 1 and resumes the SAME id in turn 2", () => {
    const state = makeState();
    runTrials(makeArgs(FEEDBACK), caseDeps(state, twoTurns));
    const [first, second] = state.agentCalls;
    expect(first?.args.slice(-2)).toEqual(["--session-id", "0f8fad5b-d9cb-469f-a165-70867728950e"]);
    expect(second?.args.slice(-2)).toEqual(["--resume", "0f8fad5b-d9cb-469f-a165-70867728950e"]);
    expect(second?.args[1]).toBe("yes, file it");
  });

  it("gives every trial a conversation of its own", () => {
    const state = makeState();
    let next = 0;
    const ids = ["11111111-1111-1111-1111-111111111111", "22222222-2222-2222-2222-222222222222"];
    const deps = caseDeps(state, twoTurns, { newSessionId: () => ids[next++] as string });
    runTrials(makeArgs({ ...FEEDBACK, trials: 2 }), deps);
    expect(state.agentCalls.map((call) => call.args.at(-1))).toEqual([
      ids[0],
      ids[0],
      ids[1],
      ids[1],
    ]);
  });

  it("stops at a turn that crashed: no later turn runs, and the grader never does", () => {
    const state = makeState();
    const deps = caseDeps(state, twoTurns, {
      spawnAgent: () => {
        state.events.push("agent");
        throw new Error("exit 1");
      },
    });
    runTrials(makeArgs(FEEDBACK), deps);
    expect(state.events.filter((event) => !event.startsWith("kept"))).toEqual([
      "turn 1: the prompt",
      "agent",
    ]);
    expect(state.ledgerRows[0]).toMatchObject({ result: "fail", note: "agent crashed: exit 1" });
  });

  it.each([
    [
      "a malformed turns declaration",
      { fixture: "evals/fixtures/feedback", turns: { "3": "yes" } },
      makeArgs(FEEDBACK),
      /no reply for turn 2/,
    ],
    [
      "a platform that cannot resume",
      twoTurns,
      makeArgs({ ...FEEDBACK, platform: "codex" }),
      /cannot drive a multi-turn/,
    ],
    [
      "an override",
      twoTurns,
      makeArgs({ ...FEEDBACK, agentCommand: 'x "{prompt}"' }),
      /one --agent-command/,
    ],
  ])("crashes on %s before anything is scaffolded, and writes no row", (_label, manifest, args, reason) => {
    const state = makeState();
    const deps = caseDeps(state, manifest, {
      assertTiersGreen: () => {},
      appendQuotaSpend: () => {},
    });
    expect(() => runTrials(args, deps)).toThrow(reason);
    expect(() => runTrials(args, deps)).toThrow(HarnessError);
    expect(state.cleanedUp).toEqual([]);
    expect(state.ledgerRows).toEqual([]);
  });
});

describe("runTrials — a case that declares the checkout-install setup", () => {
  const installed = { fixture: "evals/fixtures/feedback", setup: "checkout-install" };

  it("packs, installs and runs init in the project, in order, before the agent starts", () => {
    const state = makeState();
    runTrials(makeArgs(FEEDBACK), caseDeps(state, installed));
    expect(state.preStepCalls.map((call) => [call.command, call.args[0], call.cwd])).toEqual([
      ["pnpm", "pack", "/fake/repo/packages/cli"],
      ["npm", "install", "/scratch/feedback"],
      [
        "node",
        "/scratch/feedback/node_modules/@narrativetrace/cli/bin/narrativetrace.js",
        "/scratch/feedback",
      ],
    ]);
    expect(state.preStepCalls[0]?.args.at(-1)).toBe("/work/trial-1/packages");
    expect(state.agentCalls).toHaveLength(1);
  });

  it("runs the setup against the trial's own configuration and stand-ins", () => {
    const state = makeState();
    runTrials(makeArgs(FEEDBACK), caseDeps(state, installed));
    for (const call of state.preStepCalls) {
      expect(call.env?.CLAUDE_CONFIG_DIR).toBe("/work/trial-1/config");
      expect(call.env?.PATH?.startsWith("/work/trial-1/bin:")).toBe(true);
    }
  });

  it("CRASHES on a failed setup command, naming it, with no row and no agent", () => {
    const state = makeState();
    const deps = caseDeps(state, installed, {
      spawnPreStep: (command) => {
        if (command === "npm") throw new Error("ENOTFOUND");
      },
    });
    expect(() => runTrials(makeArgs(FEEDBACK), deps)).toThrow(CaseSetupError);
    expect(() => runTrials(makeArgs(FEEDBACK), deps)).toThrow(
      /case setup failed: npm install .* ENOTFOUND/,
    );
    expect(state.agentCalls).toEqual([]);
    expect(state.ledgerRows).toEqual([]);
  });

  it("refuses a setup outside the vocabulary before anything is scaffolded", () => {
    const state = makeState();
    const deps = caseDeps(state, { fixture: "evals/fixtures/feedback", setup: "npm-install" });
    expect(() => runTrials(makeArgs(FEEDBACK), deps)).toThrow(
      /"setup": "npm-install", which is not one of checkout-install, checkout-registry/,
    );
    expect(state.cleanedUp).toEqual([]);
  });

  it("refuses a case that declares a setup AND a registry — both would deliver the pages", () => {
    const state = makeState();
    const deps = caseDeps(state, { ...installed, registry: "npx-skills" });
    expect(() => runTrials(makeArgs(FEEDBACK), deps)).toThrow(/both a setup and a registry/);
  });
});

describe("runTrials — a case that declares the checkout-registry setup", () => {
  const registry = { fixture: "evals/fixtures/feedback", setup: "checkout-registry" };

  it("packs every publishable package, starts the registry, installs the project, then the agent", () => {
    const state = makeState();
    runTrials(makeArgs(FEEDBACK), caseDeps(state, registry));
    expect(state.preStepCalls.map((call) => [call.command, call.args[0], call.cwd])).toEqual([
      ["pnpm", "pack", "/fake/repo/packages/cli"],
      ["npm", "install", "/scratch/feedback"],
    ]);
    expect(state.preStepCalls[1]?.env?.NPM_CONFIG_USERCONFIG).toBe("/work/trial-1/npmrc");
    expect(state.preStepCalls[0]?.args.at(-1)).toBe("/work/trial-1/packages");
    expect(state.events.slice(0, 2)).toEqual([
      "registry up: /work/trial-1/packages -> /work/trial-1/npmrc",
      "turn 1: the prompt",
    ]);
  });

  it("points the agent's AND the grader's npm at the trial's own npmrc", () => {
    const state = makeState();
    runTrials(makeArgs(FEEDBACK), caseDeps(state, registry));
    expect(state.agentCalls[0]?.env?.NPM_CONFIG_USERCONFIG).toBe("/work/trial-1/npmrc");
    expect(state.graderCalls[0]?.env?.NPM_CONFIG_USERCONFIG).toBe("/work/trial-1/npmrc");
  });

  it("stops the registry after grading, before the work directory is removed", () => {
    const state = makeState();
    runTrials(makeArgs(FEEDBACK), caseDeps(state, registry));
    const withoutEvidence = state.events.filter((event) => !event.startsWith("kept"));
    expect(withoutEvidence.slice(-2)).toEqual(["grader", "registry down"]);
    expect(state.cleanedUp).toContain("/work/trial-1");
  });

  it("stops the registry even when the agent crashes", () => {
    const state = makeState();
    const deps = caseDeps(state, registry, {
      spawnAgent: () => {
        throw new Error("agent exploded");
      },
    });
    runTrials(makeArgs(FEEDBACK), deps);
    expect(state.events.at(-1)).toBe("registry down");
  });

  it("CRASHES with no row and no agent when the registry cannot start", () => {
    const state = makeState();
    const deps = caseDeps(state, registry, {
      startRegistry: () => {
        throw new Error("no npmrc after 30 s");
      },
    });
    expect(() => runTrials(makeArgs(FEEDBACK), deps)).toThrow(CaseSetupError);
    expect(() => runTrials(makeArgs(FEEDBACK), deps)).toThrow(
      /case setup failed: the local registry did not start — no npmrc after 30 s/,
    );
    expect(state.agentCalls).toEqual([]);
    expect(state.ledgerRows).toEqual([]);
  });

  it("stops the registry it started when the project's own install fails", () => {
    const state = makeState();
    const deps = caseDeps(state, registry, {
      spawnPreStep: (command) => {
        if (command === "npm") throw new Error("ETARGET");
      },
    });
    expect(() => runTrials(makeArgs(FEEDBACK), deps)).toThrow(/case setup failed: npm install/);
    expect(state.events.at(-1)).toBe("registry down");
  });

  it("starts no registry for a case without the setup", () => {
    const state = makeState();
    runTrials(makeArgs(FEEDBACK), caseDeps(state, { fixture: "evals/fixtures/feedback" }));
    expect(state.events.some((event) => event.startsWith("registry"))).toBe(false);
  });
});
