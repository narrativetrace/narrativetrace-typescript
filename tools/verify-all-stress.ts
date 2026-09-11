// SPDX-License-Identifier: BUSL-1.1
// Licensed under the Business Source License 1.1 (see LICENSE); Change Date: four years from publication; Change License: Apache-2.0
// Copyright (c) 2026 Empower Agile
import { join } from "node:path";
import { type CommandOutcome, runCommand } from "./verify-all-exec.js";

export interface StressLongOutcome {
  readonly outcome: CommandOutcome;
  readonly budgetSeconds: number;
}

const DEFAULT_BUDGET_SECONDS = 5 * 60;

/**
 * `pnpm run stress` — the long, fresh-random-seed sweep (`packages/core/tools/run-stress.ts`),
 * budgeted via `NARRATIVETRACE_STRESS_BUDGET_SECONDS` (default 5 min) rather than unbounded, so
 * unlike Java's jcstress default-depth sweep this needs no explicit time-box override to run at
 * its true default.
 */
export function runStressLongSweep(repoRoot: string, logDir: string): StressLongOutcome {
  const budgetEnv = Number(process.env.NARRATIVETRACE_STRESS_BUDGET_SECONDS);
  const budgetSeconds = budgetEnv || DEFAULT_BUDGET_SECONDS;
  const outcome = runCommand("pnpm", ["run", "stress"], join(logDir, "stress-long.log"), {
    cwd: repoRoot,
  });
  return { outcome, budgetSeconds };
}
