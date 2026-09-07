// SPDX-License-Identifier: BUSL-1.1
// Licensed under the Business Source License 1.1 (see LICENSE); Change Date: four years from publication; Change License: Apache-2.0
// Copyright (c) 2026 Empower Agile
import {
  methodSignature,
  returned,
  type TraceNode,
  type TraceTree,
  traceTree,
} from "@narrativetrace/core";
import type { TraceShapeCase } from "./types.js";

/**
 * Turns a declarative {@link TraceShapeCase} into a live `TraceTree` whose walk every bounded,
 * cycle-safe renderer/exporter must survive.
 *
 * INTENT: `hostile-graphs.ts` builds arbitrary object graphs for the value renderer; this builds
 * `TraceNode` call trees specifically, for the separate walker (`TreeWalk`, `tree-walk.ts`) every
 * recursive renderer and exporter shares. The corpus stays data — the ports copy
 * `trace-shapes.json` verbatim and write their own builder.
 *
 * @remarks A cyclic tree here is hand-built by mutating a frozen-looking `children` array before
 * anyone else observes it — `traceNode()` deep-freezes its own copy, so a real cycle can only be
 * expressed by bypassing that constructor, exactly the "hand-built or deserialized tree" threat
 * model the bound exists for.
 */
export function build(shapeCase: TraceShapeCase): TraceTree {
  return traceTree([root(shapeCase)]);
}

function root(shapeCase: TraceShapeCase): TraceNode {
  if (shapeCase.kind === "chain") return chain(shapeCase.n);
  if (shapeCase.kind === "cycle") return ring(shapeCase.n);
  throw new Error(`unknown trace shape kind: ${shapeCase.kind}`);
}

/** A linear chain `depth` nodes deep, innermost leaf first. */
function chain(depth: number): TraceNode {
  let current = node("leaf", []);
  for (let i = 0; i < depth; i++) {
    current = node(`call${i}`, [current]);
  }
  return current;
}

/** A ring of `length` nodes, each holding the next; `length === 1` holds itself. */
function ring(length: number): TraceNode {
  const nodes = Array.from({ length }, (_, i) => node(`n${i}`, []));
  for (const [i, n] of nodes.entries()) {
    (n.children as TraceNode[]).push(nodes[(i + 1) % length] as TraceNode);
  }
  return nodes[0] as TraceNode;
}

/** A node with a mutable `children` array (not `traceNode()`'s frozen copy), so `ring` can link it. */
function node(methodName: string, children: TraceNode[]): TraceNode {
  return {
    signature: methodSignature("HostileTraceShape", methodName, []),
    outcome: returned('"ok"'),
    children,
    durationMs: 1,
    startTimeMs: 0,
  };
}
