// SPDX-License-Identifier: BUSL-1.1
// Licensed under the Business Source License 1.1 (see LICENSE); Change Date: four years from publication; Change License: Apache-2.0
// Copyright (c) 2026 Empower Agile
import type { TraceNode } from "./trace-node.js";

export type SequentialAsyncResult = {
  readonly isSequentialAsync: boolean;
  readonly totalMs: number;
  readonly parallelizableMs: number;
};

export function analyze(members: readonly TraceNode[]): SequentialAsyncResult {
  if (members.length < 2) {
    return { isSequentialAsync: false, totalMs: 0, parallelizableMs: 0 };
  }

  const sorted = [...members].sort((a, b) => a.startTimeMs - b.startTimeMs);
  const isSequentialAsync = hasNoOverlap(sorted);
  const totalMs = members.reduce((sum, m) => sum + m.durationMs, 0);
  const parallelizableMs = Math.max(...members.map((m) => m.durationMs));

  return { isSequentialAsync, totalMs, parallelizableMs };
}

function hasNoOverlap(sorted: readonly TraceNode[]): boolean {
  for (let i = 1; i < sorted.length; i++) {
    const prev = sorted[i - 1]!;
    const curr = sorted[i]!;
    if (curr.startTimeMs < prev.startTimeMs + prev.durationMs) {
      return false;
    }
  }
  return true;
}
