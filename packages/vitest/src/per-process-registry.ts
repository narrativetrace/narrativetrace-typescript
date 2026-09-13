// SPDX-License-Identifier: BUSL-1.1
// Licensed under the Business Source License 1.1 (see LICENSE); Change Date: four years from publication; Change License: Apache-2.0
// Copyright (c) 2026 Empower Agile
/**
 * A per-process, insertion-order registry: push as each test completes, drain once at suite end.
 * Vitest fixtures have no suite-close hook, so accumulation happens here — the single-process
 * fallback each of the clarity/structural/manifest accumulators keeps alongside `task.meta`'s
 * cross-worker-safe channel (see `task-meta-walk.ts`), previously three copies of the identical
 * push/count/drain trio. Duplicate values are retained — different test files may share a display
 * name and each run is a distinct data point.
 */
export interface PerProcessRegistry<T> {
  record(value: T): void;
  count(): number;
  /** Returns a copy of the accumulated values (insertion order) and clears the registry. */
  drain(): T[];
}

export function createPerProcessRegistry<T>(): PerProcessRegistry<T> {
  const items: T[] = [];
  return {
    record(value: T): void {
      items.push(value);
    },
    count(): number {
      return items.length;
    },
    drain(): T[] {
      const copy = [...items];
      items.length = 0;
      return copy;
    },
  };
}
