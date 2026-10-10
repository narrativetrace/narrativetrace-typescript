// SPDX-License-Identifier: BUSL-1.1
// Licensed under the Business Source License 1.1 (see LICENSE); Change Date: four years from publication; Change License: Apache-2.0
// Copyright (c) 2026 Empower Agile
import { methodSignature, returned, type TraceNode, traceNode } from "@narrativetrace/core";
import { describe, expect, test } from "vitest";
import { MERMAID_GRAMMAR } from "../src/mermaid-grammar.js";
import { PLANTUML_GRAMMAR } from "../src/plantuml-grammar.js";
import type { SequenceGrammar } from "../src/sequence-grammar.js";
import { collectParticipants, renderInteractions } from "../src/sequence-walk.js";

/**
 * Wall-clock budget for rendering a 5,000-deep chain. The dev machine does it in ~50 ms (~95 ms
 * under coverage instrumentation; ~1.2 s there before the fix); a shared CI runner was ~7x slower
 * than that. Two seconds therefore passes on any plausible runner yet fails fast on a per-node cost
 * that grows with depth (span-id validation re-walking the whole ancestor path), which took 5-8 s
 * on that runner. A budget, not a micro-benchmark: it is a regression tripwire.
 */
const BUDGET_MS = 2_000;
const DEPTH = 5_000;

function chain(depth: number): TraceNode {
  let current = traceNode(methodSignature("Recursive", "bottom", []), returned('"ok"'), []);
  for (let i = 0; i < depth; i++) {
    current = traceNode(methodSignature("Recursive", `call${i}`, []), returned('"ok"'), [current]);
  }
  return current;
}

function elapsedMsRendering(root: TraceNode, grammar: SequenceGrammar): number {
  const aliases = collectParticipants([root]);
  const start = performance.now();
  renderInteractions([root], aliases, grammar);
  return performance.now() - start;
}

describe("sequence walk performance: deep chain", () => {
  test.each([
    ["mermaid", MERMAID_GRAMMAR],
    ["plantuml", PLANTUML_GRAMMAR],
  ])("%s renders a 5,000-deep chain within the wall-clock budget", (_name, grammar) => {
    const root = chain(DEPTH);
    expect(elapsedMsRendering(root, grammar)).toBeLessThan(BUDGET_MS);
  });
});
