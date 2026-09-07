// SPDX-License-Identifier: BUSL-1.1
// Licensed under the Business Source License 1.1 (see LICENSE); Change Date: four years from publication; Change License: Apache-2.0
// Copyright (c) 2026 Empower Agile
/**
 * Structural inputs are the trace-wide maxima (Java `ClarityAnalyzer.structuralFactor`): the single
 * highest parameter count across all nodes and the deepest call depth. The score is one global-max
 * penalty, NOT a per-node average — a trace is only as structurally clear as its worst offender.
 */
export type StructuralInput = {
  readonly paramCount: number;
  readonly depth: number;
};

const MAX_GOOD_PARAMS = 4;
const MAX_GOOD_DEPTH = 5;

// Java parity (structuralFactor): 0.10 per parameter over 4, 0.05 per depth level over 5.
const PARAM_PENALTY_PER_EXCESS = 0.1;
const DEPTH_PENALTY_PER_EXCESS = 0.05;

export function scoreStructural(input: StructuralInput): number {
  const paramPenalty = Math.max(0, input.paramCount - MAX_GOOD_PARAMS) * PARAM_PENALTY_PER_EXCESS;
  const depthPenalty = Math.max(0, input.depth - MAX_GOOD_DEPTH) * DEPTH_PENALTY_PER_EXCESS;
  return Math.max(0, 1.0 - paramPenalty - depthPenalty);
}
