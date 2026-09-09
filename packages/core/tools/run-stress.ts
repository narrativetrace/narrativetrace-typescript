// SPDX-License-Identifier: BUSL-1.1
// Licensed under the Business Source License 1.1 (see LICENSE); Change Date: four years from publication; Change License: Apache-2.0
// Copyright (c) 2026 Empower Agile
import { spawnSync } from "node:child_process";

/**
 * The long randomized concurrency/lifecycle sweep (`pnpm run stress`), budgeted — the
 * scheduled/manual job only (the repository's own scheduled stress workflow), distinct from
 * the short seeded subset every `pnpm run check` pays for (the `*.stress.test.ts` files under
 * `__tests__/stress/`, which vitest already picks up on every ordinary `vitest run`).
 *
 * INTENT: mirrors `packages/security-tests`' fuzz/regression-replay split and Java's
 * `FuzzBudget.PER_TARGET` — one place the schedule's cost is written down, rather than repeated
 * per invocation. Each iteration re-runs the same stress suite with
 * `NARRATIVETRACE_STRESS_LONG=1` (bigger volume via `stressScale`, a fresh random seed printed on
 * start), so repeated iterations explore different interleavings instead of replaying one.
 *
 * @llmNote A failure prints its seed (`[stress] long sweep seed=...`); replay it deterministically
 * with `NARRATIVETRACE_STRESS_LONG=1 NARRATIVETRACE_STRESS_SEED=<seed> npx vitest run
 * __tests__/stress/`.
 */
const DEFAULT_BUDGET_SECONDS = 5 * 60;
const BUDGET_SECONDS =
  Number(process.env.NARRATIVETRACE_STRESS_BUDGET_SECONDS) || DEFAULT_BUDGET_SECONDS;

function runOnce(): boolean {
  const result = spawnSync("npx", ["vitest", "run", "__tests__/stress/"], {
    stdio: "inherit",
    env: { ...process.env, NARRATIVETRACE_STRESS_LONG: "1" },
  });
  return result.status === 0;
}

function sweep(deadline: number): { iterations: number; failed: boolean } {
  let iterations = 0;
  while (Date.now() < deadline) {
    iterations++;
    console.log(`\n=== stress sweep iteration ${iterations} ===`);
    if (!runOnce()) return { iterations, failed: true };
  }
  return { iterations, failed: false };
}

function main(): void {
  const { iterations, failed } = sweep(Date.now() + BUDGET_SECONDS * 1000);
  console.log(`\nstress sweep: ${iterations} iteration(s) in a ${BUDGET_SECONDS}s budget`);
  if (failed) process.exit(1);
}

main();
