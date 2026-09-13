// SPDX-License-Identifier: BUSL-1.1
// Licensed under the Business Source License 1.1 (see LICENSE); Change Date: four years from publication; Change License: Apache-2.0
// Copyright (c) 2026 Empower Agile
import type { ScenarioDelta } from "@narrativetrace/core-node";
import { ConsoleSummaryReporter } from "./console-summary-reporter.js";
import { createPerProcessRegistry } from "./per-process-registry.js";

/**
 * Per-process registry that fixtures push into as each test writes its structural artifact,
 * drained by the suite reporter once every test in the process has run — the structural twin of
 * `suite-clarity-accumulator.ts` — see `per-process-registry.ts`.
 */
const registry = createPerProcessRegistry<ScenarioDelta>();

export function recordStructuralDelta(delta: ScenarioDelta): void {
  registry.record(delta);
}

export function structuralDeltaCount(): number {
  return registry.count();
}

/** Returns a copy of the accumulated deltas (insertion order) and clears the registry. */
export function drainStructuralDeltas(): ScenarioDelta[] {
  return registry.drain();
}

/**
 * Builds the one-shot "Since last green" suite line (Java `ConsoleSummaryReporter.formatDeltaLine`,
 * prefixed the way the reference runtime's footer prints it). Returns `undefined` when no test
 * wrote a structural artifact, so callers print nothing.
 */
export function structuralDeltaFooterLine(deltas: readonly ScenarioDelta[]): string | undefined {
  if (deltas.length === 0) return undefined;
  return `  Since last green: ${new ConsoleSummaryReporter().formatDeltaLine(deltas)}`;
}
