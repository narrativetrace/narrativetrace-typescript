// SPDX-License-Identifier: BUSL-1.1
// Licensed under the Business Source License 1.1 (see LICENSE); Change Date: four years from publication; Change License: Apache-2.0
// Copyright (c) 2026 Empower Agile
import { execFileSync } from "node:child_process";

/**
 * Sporadic-lanes policy, rule 3 (skill-evals-multi-platform-2026-09-13.md, owner-ruled
 * 2026-09-13): "Deterministic tiers first, always. A cheaper-lane run refuses to start unless the
 * skill's Tier A lints and Tier A2 replay are green at HEAD — a Tier B trial on a skill whose
 * replay is red is quota burned on a known defect." `run` is injectable (the `replay.ts` idiom in
 * this same package) so a unit test can fake the command without a real vitest run.
 */
export type RunCommand = (command: string, args: readonly string[], cwd: string) => void;

export function runCommand(command: string, args: readonly string[], cwd: string): void {
  execFileSync(command, args, { cwd, stdio: "pipe" });
}

const TIER_A_AND_A2_FILES = ["__tests__/lints.test.ts", "__tests__/replay.test.ts"] as const;

/** Throws with a quota-preserving explanation when the skills package's Tier A/A2 suite is red. */
export function assertDeterministicTiersGreen(
  repoRoot: string,
  run: RunCommand = runCommand,
): void {
  try {
    run(
      "pnpm",
      ["--filter", "@narrativetrace/skills", "exec", "vitest", "run", ...TIER_A_AND_A2_FILES],
      repoRoot,
    );
  } catch (error) {
    throw new Error(
      "Tier A lints / Tier A2 replay are not green at HEAD for @narrativetrace/skills — a " +
        "sporadic-lane (codex/gemini) trial refuses to start on top of a known defect. Fix " +
        "packages/skills' own tests before spending quota here.",
      { cause: error },
    );
  }
}
