// SPDX-License-Identifier: BUSL-1.1
// Licensed under the Business Source License 1.1 (see LICENSE); Change Date: four years from publication; Change License: Apache-2.0
// Copyright (c) 2026 Empower Agile
import { execFileSync } from "node:child_process";
import { join } from "node:path";
import { describe, expect, it, vi } from "vitest";
import { ADD_NARRATIVE_TRACING } from "../src/catalogue/add-narrative-tracing.js";
import {
  APPROVAL_FLOW_DIFF,
  OPEN_NEWEST_RENDERED_TRACE,
} from "../src/catalogue/doctor-commands.js";
import { NARRATIVETRACE_DOCTOR } from "../src/catalogue/narrativetrace-doctor.js";
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
const REPLAY_TIMEOUT_MS = 60_000;

describe
  .skipIf(!REPO_ROOT_REACHABLE)
  .sequential("Tier A2 replay against examples/sixty-seconds", () => {
    const fixtureDir = join(REPO_ROOT, NARRATIVETRACE_DOCTOR.fixture);

    it.each([
      ["narrativetrace-doctor", NARRATIVETRACE_DOCTOR],
      ["add-narrative-tracing", ADD_NARRATIVE_TRACING],
    ] as const)(
      "%s: every step with something mechanical to run succeeds",
      (_name, skill) => {
        const results = replaySkill(skill, fixtureDir, runReplayCommand);
        const failing = results.filter((r) => !r.ok);
        expect(failing, JSON.stringify(failing, null, 2)).toEqual([]);
      },
      REPLAY_TIMEOUT_MS,
    );

    it(
      "at least one step actually ran, for each skill (the replay is not silently a no-op)",
      () => {
        for (const skill of [NARRATIVETRACE_DOCTOR, ADD_NARRATIVE_TRACING]) {
          const results = replaySkill(skill, fixtureDir, runReplayCommand);
          expect(results.some((r) => r.ran)).toBe(true);
        }
      },
      REPLAY_TIMEOUT_MS,
    );

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
      REPLAY_TIMEOUT_MS,
    );
  });
