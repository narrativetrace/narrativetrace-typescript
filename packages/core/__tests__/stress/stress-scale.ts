// SPDX-License-Identifier: BUSL-1.1
// Licensed under the Business Source License 1.1 (see LICENSE); Change Date: four years from publication; Change License: Apache-2.0
// Copyright (c) 2026 Empower Agile
/**
 * Scales a stress scenario between the short, seeded subset every `pnpm run check` pays for
 * (fast, fully reproducible) and the long randomized sweep (`pnpm run stress`, scheduled job
 * only — never per commit, same cadence rule as mutation testing and fuzzing).
 *
 * INTENT: mirrors packages/security-tests' Tier A/Tier B fuzzing split. A fixed seed and modest
 * volume keep the gate path in the seconds range and any failure reproducible from the seed
 * printed in the test name; the long sweep trades reproducibility for a fresh random seed and a
 * much larger volume each run, so it explores interleavings the fixed seed never will. A long-mode
 * failure logs its seed so it can be replayed by hand with NARRATIVETRACE_STRESS_SEED.
 */
export interface StressScale {
  readonly seed: number;
  readonly long: boolean;
  /** Multiplies `base` by the long-sweep factor when running long, otherwise returns it as-is. */
  scale(base: number): number;
}

const LONG_MULTIPLIER = 20;

export function stressScale(fixedSeed: number): StressScale {
  const long = process.env.NARRATIVETRACE_STRESS_LONG === "1";
  const forcedSeed = process.env.NARRATIVETRACE_STRESS_SEED;
  const seed = long ? (forcedSeed ? Number(forcedSeed) : randomSeed()) : fixedSeed;
  if (long) console.log(`[stress] long sweep seed=${seed}`);
  return { seed, long, scale: (base) => (long ? base * LONG_MULTIPLIER : base) };
}

function randomSeed(): number {
  return Math.floor(Math.random() * 0xffffffff);
}
