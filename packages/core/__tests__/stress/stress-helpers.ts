// SPDX-License-Identifier: BUSL-1.1
// Licensed under the Business Source License 1.1 (see LICENSE); Change Date: four years from publication; Change License: Apache-2.0
// Copyright (c) 2026 Empower Agile
import type { TraceNode } from "../../src/trace-node.js";

/**
 * Seeded xorshift-style PRNG (mulberry32): every stress scenario built on this is reproducible
 * from its printed seed, never a flake that only shows up sometimes.
 */
export function mulberry32(seed: number): () => number {
  let a = seed;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Total node count across a captured trace, roots and descendants — one node per span. */
export function countNodes(nodes: readonly TraceNode[]): number {
  let total = 0;
  for (const node of nodes) total += 1 + countNodes(node.children);
  return total;
}

/**
 * Randomly yields to a microtask, a macrotask, or not at all, so concurrent workers genuinely
 * interleave their publishes across the scheduler rather than running back-to-back.
 */
export async function randomYield(rand: () => number): Promise<void> {
  const r = rand();
  if (r < 0.34) return;
  if (r < 0.67) {
    await Promise.resolve();
    return;
  }
  await new Promise<void>((resolve) => setTimeout(resolve, 0));
}
