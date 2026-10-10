// SPDX-License-Identifier: BUSL-1.1
// Licensed under the Business Source License 1.1 (see LICENSE); Change Date: four years from publication; Change License: Apache-2.0
// Copyright (c) 2026 Empower Agile
import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, rmSync, symlinkSync } from "node:fs";
import { join } from "node:path";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { ADD_NARRATIVE_TRACING } from "../src/catalogue/add-narrative-tracing.js";
import { ADD_NARRATIVETRACE_CLARITY } from "../src/catalogue/add-narrativetrace-clarity.js";
import {
  APPROVAL_FLOW_DIFF,
  OPEN_NEWEST_RENDERED_TRACE,
} from "../src/catalogue/doctor-commands.js";
import { NARRATIVETRACE_DEBUG } from "../src/catalogue/narrativetrace-debug.js";
import { NARRATIVETRACE_DOCTOR } from "../src/catalogue/narrativetrace-doctor.js";
import { NARRATIVETRACE_FEEDBACK } from "../src/catalogue/narrativetrace-feedback.js";
import { NARRATIVETRACE_VERIFY } from "../src/catalogue/narrativetrace-verify.js";
import { THE_PATH, THE_REPRODUCTION } from "../src/catalogue/verify-commands.js";
import { replaySkill, runReplayCommand } from "../src/replay.js";
import { REPO_ROOT, REPO_ROOT_REACHABLE } from "./repo-root.js";

describe("replaySkill (generic replayer, unit-level)", () => {
  it("records a step with neither commands nor verify as not-ran, still ok", () => {
    const skill = {
      ...NARRATIVETRACE_DOCTOR,
      steps: [{ title: "narrative only", body: { kind: "commands" as const, commands: [] } }],
    };
    const [result] = replaySkill(skill, "/does-not-matter", vi.fn());
    expect(result).toEqual({ title: "narrative only", ran: false, ok: true });
  });

  it("runs every command and the verify, deduplicated, for a step that has both", () => {
    const run = vi.fn();
    const skill = {
      ...NARRATIVETRACE_DOCTOR,
      steps: [
        {
          title: "install",
          body: { kind: "commands" as const, commands: ["pnpm install --frozen-lockfile"] },
          verify: "pnpm install --frozen-lockfile",
        },
      ],
    };
    const [result] = replaySkill(skill, "/fixture", run);
    expect(result).toEqual({ title: "install", ran: true, ok: true });
    expect(run).toHaveBeenCalledTimes(1);
    expect(run).toHaveBeenCalledWith("pnpm install --frozen-lockfile", "/fixture");
  });

  it("reports a failing step by name and message, without throwing", () => {
    const run = vi.fn(() => {
      throw new Error("boom");
    });
    const skill = {
      ...NARRATIVETRACE_DOCTOR,
      steps: [{ title: "flaky", body: { kind: "commands" as const, commands: ["node -e 1"] } }],
    };
    const [result] = replaySkill(skill, "/fixture", run);
    expect(result.ran).toBe(true);
    expect(result.ok).toBe(false);
    expect(result.error).toContain("boom");
  });

  it("a snippet step WITH a verify still runs the verify command", () => {
    // A snippet step's body never carries commands — verify is the only thing there is to run,
    // and pulling "commands" from a snippet body (there are none) must not blow up doing it.
    const run = vi.fn();
    const skill = {
      ...NARRATIVETRACE_DOCTOR,
      steps: [
        {
          title: "show it",
          body: { kind: "snippet" as const, path: "x.js", language: "js" },
          verify: "pnpm test",
        },
      ],
    };
    const [result] = replaySkill(skill, "/fixture", run);
    expect(result).toEqual({ title: "show it", ran: true, ok: true });
    expect(run).toHaveBeenCalledTimes(1);
    expect(run).toHaveBeenCalledWith("pnpm test", "/fixture");
  });

  it("a snippet step with no verify is not-ran (nothing mechanical to replay)", () => {
    const skill = {
      ...NARRATIVETRACE_DOCTOR,
      steps: [
        { title: "show it", body: { kind: "snippet" as const, path: "x.js", language: "js" } },
      ],
    };
    const [result] = replaySkill(skill, "/fixture", vi.fn());
    expect(result).toEqual({ title: "show it", ran: false, ok: true });
  });
});

// Tier A2: the real oracle replay, against the real fixture, no fakes, no LLM. This is what proves
// H1 — the shipped catalogue's own step data still executes today against the packages actually
// in this workspace. Both mechanical skills share one fixture (examples/sixty-seconds).
//
// The replay REALLY runs each step's commands — `pnpm install --frozen-lockfile`, `vitest run`, the
// example's own `node` invocations — so it is by far the slowest thing in this package. Each skill is
// therefore replayed exactly ONCE, in the hook below, and every assertion reads those results: the
// same two skills replayed per test cost three times the subprocesses for no extra evidence, and
// under a full `pnpm run check` (every package's coverage in parallel) that slack was enough to blow
// a 60-second per-test budget for real.
//
// The budget below guards against a HANG, and is not a performance assertion (those live in the bench
// suite): one replay measures ~18s in isolation here and up to ~60s inside a fully parallel gate, so
// two of them get three times the isolated measurement rather than a figure they only just fit.
const REPLAY_BUDGET_MS = 180_000;

const MECHANICAL_SKILLS = [
  ["narrativetrace-doctor", NARRATIVETRACE_DOCTOR],
  ["add-narrative-tracing", ADD_NARRATIVE_TRACING],
] as const;

/**
 * The agent substitutes these placeholders with the user's own report; the replay fills each with
 * a value-free sentence of its own, so the REAL verb runs and its gate has something to clear.
 */
const REPORT_FILL: ReadonlyMap<string, string> = new Map([
  ["<category>", "doctor"],
  ["<where it happened>", "trap.redaction-proof"],
  ["<what you did>", "ran the doctor on the fixture"],
  ["<what happened>", "the finding stayed failing after the fix"],
  ["<what you expected>", "the finding passes"],
]);

/**
 * Links THIS checkout's `@narrativetrace/cli` into a fixture that declares it but installs nothing,
 * and returns the undo. `npx @narrativetrace/cli` resolves the package from the fixture's OWN
 * project tree, never an ancestor's — without the link it quietly runs whatever PUBLISHED release
 * npx has cached, and the replay measures the release calendar instead of this code (found
 * 2026-10-09: the doctor's check count moved here, the cached release's did not). Lands under the
 * fixture's gitignored `node_modules`, and is removed again.
 */
function linkCheckoutCli(fixtureDir: string): () => void {
  const scope = join(fixtureDir, "node_modules", "@narrativetrace");
  const link = join(scope, "cli");
  if (existsSync(link)) return () => {};
  mkdirSync(scope, { recursive: true });
  symlinkSync(join(REPO_ROOT, "packages", "cli"), link, "dir");
  return () => rmSync(link, { force: true });
}

function fillReport(command: string): string {
  let filled = command;
  for (const [placeholder, text] of REPORT_FILL) filled = filled.replaceAll(placeholder, text);
  return filled;
}

describe
  .skipIf(!REPO_ROOT_REACHABLE)
  .sequential("Tier A2 replay against examples/sixty-seconds", () => {
    const fixtureDir = join(REPO_ROOT, NARRATIVETRACE_DOCTOR.fixture);
    const replays = new Map<string, ReturnType<typeof replaySkill>>();

    // One hook per skill, each handing the event loop back before it blocks it again: a replay
    // runs its commands with a synchronous `execFileSync`, and a worker whose loop never turns for
    // 60 s cannot read the runner's answer, so Vitest reports `Timeout calling "onTaskUpdate"` as an
    // unhandled error and exits 1. Awaiting a promise only drains microtasks; `setImmediate` is a
    // macrotask, and the loop reads its I/O on the way to it.
    const letTheLoopTurn = () => new Promise<void>((resolve) => setImmediate(resolve));
    for (const [name, skill] of MECHANICAL_SKILLS) {
      beforeAll(async () => {
        await letTheLoopTurn();
        replays.set(name, replaySkill(skill, fixtureDir, runReplayCommand));
      }, REPLAY_BUDGET_MS);
    }

    // After the loop above, so everything in it ran BEFORE the report's files existed: the verb
    // writes under the output directory the rendered-trace commands also read.
    beforeAll(async () => {
      await letTheLoopTurn();
      replays.set(
        "narrativetrace-feedback",
        replaySkill(NARRATIVETRACE_FEEDBACK, fixtureDir, (command, cwd) =>
          runReplayCommand(fillReport(command), cwd),
        ),
      );
    }, REPLAY_BUDGET_MS);

    // The verify skill's loop and pin, for real: the run step with its placeholder filled by the
    // fixture's own flow test, the listings, the whole-suite approval run (approval mode is OFF in
    // the fixture, so it writes no review copy) and a promotion that finds nothing to promote.
    // Nothing it runs writes outside the fixture's gitignored output directory.
    beforeAll(async () => {
      await letTheLoopTurn();
      replays.set(
        "narrativetrace-verify",
        replaySkill(NARRATIVETRACE_VERIFY, fixtureDir, (command, cwd) =>
          runReplayCommand(command.replaceAll(THE_PATH, "__tests__/place-order-flow.test.ts"), cwd),
        ),
      );
    }, REPLAY_BUDGET_MS);

    // The debug skill's commands, for real: the reproduction (the flow test stands in for a red
    // one), the listings and the pin — the same no-op promotion as verify's.
    beforeAll(async () => {
      await letTheLoopTurn();
      replays.set(
        "narrativetrace-debug",
        replaySkill(NARRATIVETRACE_DEBUG, fixtureDir, (command, cwd) =>
          runReplayCommand(
            command.replaceAll(THE_REPRODUCTION, "__tests__/place-order-flow.test.ts"),
            cwd,
          ),
        ),
      );
    }, REPLAY_BUDGET_MS);

    let unlinkCli = () => {};
    afterAll(() => unlinkCli());

    // The clarity skill's own fixture: a Vitest project with the reporter wired and clean names, so
    // its gate really runs and really passes. It writes under ITS OWN output directory, which
    // nothing of the doctor's reads.
    beforeAll(async () => {
      await letTheLoopTurn();
      const clarityFixture = join(REPO_ROOT, ADD_NARRATIVETRACE_CLARITY.fixture);
      unlinkCli = linkCheckoutCli(clarityFixture);
      replays.set(
        "add-narrativetrace-clarity",
        replaySkill(ADD_NARRATIVETRACE_CLARITY, clarityFixture),
      );
    }, REPLAY_BUDGET_MS);

    function resultsFor(name: string): ReturnType<typeof replaySkill> {
      const results = replays.get(name);
      if (results === undefined) throw new Error(`${name} was not replayed`);
      return results;
    }

    it.each(
      MECHANICAL_SKILLS,
    )("%s: every step with something mechanical to run succeeds", (name) => {
      const failing = resultsFor(name).filter((r) => !r.ok);
      expect(failing, JSON.stringify(failing, null, 2)).toEqual([]);
    });

    it("narrativetrace-feedback: its commands run for real, and every mechanical verify holds", () => {
      const results = resultsFor("narrativetrace-feedback");
      expect(results.filter((r) => !r.ok)).toEqual([]);
      expect(results.filter((r) => r.ran).map((r) => r.title)).toEqual([
        "Gather what the report needs",
        "Draft the report and let the gate check it",
        "Show the whole draft, not a summary of it",
        "Print the way to file it, and nothing else",
      ]);
    });

    it("narrativetrace-verify: the run, the listings, the suite and the promotion all run for real", () => {
      const results = resultsFor("narrativetrace-verify");
      expect(results.filter((r) => !r.ok)).toEqual([]);
      expect(results.filter((r) => r.ran).map((r) => r.title)).toEqual([
        "Run the smallest real path with tracing on",
        "Read the structural trace first, against the intent",
        "Open values on the span that looks wrong, and only there",
        "Fix, re-run, read again",
        "Run the suite in approval mode and show every .received.nt",
        "Promote what was shown, and nothing else",
      ]);
    });

    it("narrativetrace-debug: the reproduction, the listings, the suite and the promotion run for real", () => {
      const results = resultsFor("narrativetrace-debug");
      expect(results.filter((r) => !r.ok)).toEqual([]);
      expect(results.filter((r) => r.ran).map((r) => r.title)).toEqual([
        "Reproduce the symptom with tracing on",
        "Find the symptom in the values",
        "Across async work, read the sequence diagram first",
        "Bisect by span, not by file",
        "Fix it in the diverging span, re-run the same input, read the same span",
        "Check that nothing else moved",
        "Run the suite in approval mode and show every .received.nt",
        "Promote what was shown, and nothing else",
      ]);
    });

    it("add-narrativetrace-clarity: the reporter, the suite, the results and the gate all run for real", () => {
      const results = resultsFor("add-narrativetrace-clarity");
      expect(results.filter((r) => !r.ok)).toEqual([]);
      expect(results.filter((r) => r.ran).map((r) => r.title)).toEqual([
        "Read the existing test setup before changing it",
        "Register the clarity reporter in the Vitest config",
        "Make sure a test captures a traced call",
        "Run the suite so the reporter writes the results",
        "Read the scores and the issues",
        "Wire the gate into the package scripts, only when asked",
        "Rename by the report's suggestions, then re-run until the gate is clean",
        "Hand missing tracing or output to the doctor",
      ]);
    });

    it("at least one step actually ran, for each skill (the replay is not silently a no-op)", () => {
      for (const [name] of MECHANICAL_SKILLS) {
        expect(resultsFor(name).some((r) => r.ran)).toBe(true);
      }
    });

    // "read the rendered trace" and "approval flow" generalise to a `node -e`
    // one-liner that finds the newest file, never a hardcoded fixture path — but replayed against
    // examples/sixty-seconds, that search must still resolve to the known files.
    it(
      "the generalised commands resolve to the fixture's known files",
      () => {
        const run = (command: string) =>
          execFileSync(command, { shell: true, cwd: fixtureDir, stdio: "pipe" }).toString("utf-8");

        const renderedTrace = run(OPEN_NEWEST_RENDERED_TRACE);
        expect(renderedTrace).toContain(
          "narrativetrace-output/sixty-seconds/places_an_order_through_the_traced_proxy.md",
        );

        const approvalFlow = run(APPROVAL_FLOW_DIFF);
        expect(approvalFlow).toContain(
          "narrativetrace-output/structural/sixty-seconds/places_an_order_through_the_traced_proxy.nt",
        );
      },
      REPLAY_BUDGET_MS,
    );
  });
