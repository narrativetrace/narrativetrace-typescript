// SPDX-License-Identifier: BUSL-1.1
// Licensed under the Business Source License 1.1 (see LICENSE); Change Date: four years from publication; Change License: Apache-2.0
// Copyright (c) 2026 Empower Agile
import type { ConcurrencyInfo } from "./concurrency-info.js";
import type { MethodSignature } from "./method-signature.js";
import type { SpanContext } from "./span-context.js";
import type { TraceOutcome } from "./trace-outcome.js";
import { walkPreOrder } from "./tree-walk.js";

/**
 * One node in the captured call tree: a single traced method invocation plus its nested calls.
 *
 * INTENT: the primary building block renderers walk. Pairs the call's {@link MethodSignature} with
 * its {@link TraceOutcome} and timing, and holds child calls made within it. `concurrency` and
 * `spanContext` are present only when the call ran inside a fork/join group or carried span metadata.
 */
export interface TraceNode {
  readonly signature: MethodSignature;
  readonly outcome: TraceOutcome;
  readonly children: readonly TraceNode[];
  readonly durationMs: number;
  readonly startTimeMs: number;
  readonly concurrency?: ConcurrencyInfo;
  readonly spanContext?: SpanContext;
}

/**
 * Builds a deeply-frozen {@link TraceNode}; children are defensively copied so callers cannot
 * mutate the tree after construction.
 *
 * @param durationMs wall-clock duration of the call; defaults to 0 when timing is unavailable.
 * @param startTimeMs epoch-relative start used to order siblings; defaults to 0.
 * @param concurrency fork/join grouping, omitted for ordinary sequential calls.
 * @param spanContext span/trace identity, omitted when not capturing distributed-trace metadata.
 */
export function traceNode(
  signature: MethodSignature,
  outcome: TraceOutcome,
  children: readonly TraceNode[],
  durationMs = 0,
  startTimeMs = 0,
  concurrency?: ConcurrencyInfo,
  spanContext?: SpanContext,
): TraceNode {
  return Object.freeze({
    signature,
    outcome,
    children: Object.freeze([...children]),
    durationMs,
    startTimeMs,
    ...(concurrency !== undefined ? { concurrency } : {}),
    ...(spanContext !== undefined ? { spanContext } : {}),
  });
}

const childrenOf = (node: TraceNode): readonly TraceNode[] => node.children;

/**
 * Reports whether any node in the given forest threw, searching the full subtree.
 *
 * INTENT: lets renderers/summaries decide up front whether an error marker is warranted without
 * re-walking the tree. Explicit-stack pre-order walk ({@link walkPreOrder}) that short-circuits on
 * the first `threw` outcome — bounded and cycle-safe, so a hand-built, replayed or deserialized
 * tree can never hang or crash this foundational check that every renderer's summary depends on.
 *
 * @returns `true` if at least one node (at any depth) has a `threw` outcome; `false` otherwise.
 */
export function hasAnyError(nodes: readonly TraceNode[]): boolean {
  let found = false;
  walkPreOrder(nodes, childrenOf, (node) => {
    if (node.outcome.kind !== "threw") return;
    found = true;
    return false;
  });
  return found;
}

/**
 * The first real {@link SpanContext} anywhere in the forest, depth-first.
 *
 * INTENT: one tree is one trace, so a real identity found *anywhere* in it is the identity of the
 * whole — `roots[0]` alone is not enough. A mixed tree (a hand-built or filtered root above a
 * captured child) is exactly the case where the root carries nothing and a descendant carries
 * everything: service, environment, story and chapter all have to be read from there. Explicit-
 * stack pre-order walk ({@link walkPreOrder}), bounded and cycle-safe for the same reason as
 * {@link hasAnyError}.
 *
 * @returns the first context in pre-order (a node before its children, roots left to right), or
 * `undefined` when no node in the forest carries one.
 */
export function firstSpanContext(nodes: readonly TraceNode[]): SpanContext | undefined {
  let found: SpanContext | undefined;
  walkPreOrder(nodes, childrenOf, (node) => {
    if (!node.spanContext) return;
    found = node.spanContext;
    return false;
  });
  return found;
}
