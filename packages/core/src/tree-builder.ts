// SPDX-License-Identifier: BUSL-1.1
// Licensed under the Business Source License 1.1 (see LICENSE); Change Date: four years from publication; Change License: Apache-2.0
// Copyright (c) 2026 Empower Agile
import { type ConcurrencyInfo, concurrencyInfo } from "./concurrency-info.js";
import type { MethodSignature } from "./method-signature.js";
import type { SpanContext } from "./span-context.js";
import type { SpanId, TraceId } from "./span-id-generator.js";
import type { ForkCreatedEvent, TraceEvent } from "./trace-event.js";
import type { TraceNode } from "./trace-node.js";
import { traceNode } from "./trace-node.js";
import type { TraceOutcome } from "./trace-outcome.js";
import { incomplete } from "./trace-outcome.js";
import type { TraceTree } from "./trace-tree.js";
import { traceTree } from "./trace-tree.js";
import { TreeWalk, walkPreOrder } from "./tree-walk.js";

interface PendingFrame {
  readonly signature: MethodSignature;
  readonly timestamp: number;
  /**
   * Position of this span's `enter` in the event stream.
   *
   * INTENT: a total order for the assembly walk that no clock can collapse. A parent's `enter`
   * always precedes its children's, so ordering by it is correct by construction — where
   * ordering by `timestamp` is only correct while timestamps happen to differ.
   */
  readonly enterIndex: number;
  readonly parentSpanId: SpanId | null;
  readonly spanContext: SpanContext;
  /** Capture's own concurrency tag, present only on the first span under an activated snapshot. */
  readonly concurrency: ConcurrencyInfo | undefined;
}

interface OrderedChild {
  readonly node: TraceNode;
  readonly eventIndex: number;
}

const ROOT = "" as SpanId;

function addChild(
  childrenOf: Map<SpanId, OrderedChild[]>,
  parent: SpanId,
  node: TraceNode,
  eventIndex: number,
): void {
  const bucket = childrenOf.get(parent);
  if (bucket) bucket.push({ node, eventIndex });
  else childrenOf.set(parent, [{ node, eventIndex }]);
}

type ExitInfo = { outcome: TraceOutcome; timestamp: number; eventIndex: number };

function indexEnter(
  frames: Map<SpanId, PendingFrame>,
  e: TraceEvent & { type: "enter" },
  enterIndex: number,
): void {
  frames.set(e.spanContext.spanId, {
    signature: e.signature,
    timestamp: e.timestamp,
    enterIndex,
    parentSpanId: e.spanContext.parentSpanId,
    spanContext: e.spanContext,
    concurrency: e.concurrency,
  });
}

function indexEvents(events: readonly TraceEvent[]) {
  const frames = new Map<SpanId, PendingFrame>();
  const exits = new Map<SpanId, ExitInfo>();
  const forks = new Map<SpanId, ForkCreatedEvent>();
  for (let i = 0; i < events.length; i++) {
    const e = events[i]!;
    if (e.type === "enter") indexEnter(frames, e, i);
    else if (e.type === "exit")
      exits.set(e.spanContext.spanId, {
        outcome: e.outcome,
        timestamp: e.timestamp,
        eventIndex: i,
      });
    else if (e.type === "fork-created") forks.set(e.rootSpanId as SpanId, e);
  }
  return { frames, exits, forks };
}

function sortedChildren(childrenOf: Map<SpanId, OrderedChild[]>, spanId: SpanId): TraceNode[] {
  return (childrenOf.get(spanId) ?? [])
    .sort((a, b) => a.eventIndex - b.eventIndex)
    .map((c) => c.node);
}

// A fork group outranks capture's own `async` tag: the group published its members deliberately,
// under the span that forked them, so its account of the relationship is the more specific one.
function deriveConcurrency(
  spanId: SpanId,
  frame: PendingFrame,
  forks: Map<SpanId, ForkCreatedEvent>,
) {
  const fork = forks.get(spanId);
  if (!fork) return frame.concurrency;
  return concurrencyInfo(
    fork.groupId,
    `${frame.signature.className}.${frame.signature.methodName}`,
    fork.strategy,
  );
}

function buildNode(
  spanId: SpanId,
  frame: PendingFrame,
  exits: Map<SpanId, ExitInfo>,
  forks: Map<SpanId, ForkCreatedEvent>,
  childrenOf: Map<SpanId, OrderedChild[]>,
): TraceNode {
  const exit = exits.get(spanId);
  return traceNode(
    frame.signature,
    exit?.outcome ?? incomplete(),
    sortedChildren(childrenOf, spanId),
    exit ? exit.timestamp - frame.timestamp : 0,
    frame.timestamp,
    deriveConcurrency(spanId, frame, forks),
    frame.spanContext,
  );
}

/**
 * Builds every node bottom-up and files it under its parent.
 *
 * @remarks Reverse ENTER-INDEX order, not reverse timestamp order. Each node snapshots its
 * children eagerly, so it must be built after them; ordering by a clock breaks the moment two
 * spans report the same instant, and then every child is dropped silently.
 *
 * Browsers coarsen `performance.now()` as a Spectre mitigation (Chrome clamps to 100us), so an
 * entire fast call tree shares one value, the sort degrades to a no-op, insertion order (parents
 * first) survives, and the subtree is lost. Node's clock is fine-grained enough that this never
 * fires there — the defect reached a browser undetected. The enter index is a total order by
 * construction and cannot tie.
 */
function assembleNodes(
  frames: Map<SpanId, PendingFrame>,
  exits: Map<SpanId, ExitInfo>,
  forks: Map<SpanId, ForkCreatedEvent>,
  childrenOf: Map<SpanId, OrderedChild[]>,
): void {
  const sorted = [...frames.entries()].sort(([, a], [, b]) => b.enterIndex - a.enterIndex);
  for (const [spanId, frame] of sorted) {
    const node = buildNode(spanId, frame, exits, forks, childrenOf);
    const parent =
      frame.parentSpanId !== null && frames.has(frame.parentSpanId) ? frame.parentSpanId : ROOT;
    addChild(childrenOf, parent, node, exits.get(spanId)?.eventIndex ?? 0);
  }
}

/**
 * Assembles captured events into the finished {@link TraceTree}.
 *
 * @param traceId the id the capturing context assigned to this run. Passed through untouched: the
 * context owns the identity, and re-deriving it here would let one capture report two. Absent only
 * when the context never minted one (nothing was traced), and then the tree resolves its own.
 */
export function buildTraceTree(
  events: readonly TraceEvent[],
  level: string,
  traceId?: TraceId,
): TraceTree {
  if (level === "off") return traceTree([], traceId);
  const { frames, exits, forks } = indexEvents(events);
  const childrenOf = new Map<SpanId, OrderedChild[]>();
  assembleNodes(frames, exits, forks, childrenOf);

  const roots = (childrenOf.get(ROOT) ?? [])
    .sort((a, b) => a.eventIndex - b.eventIndex)
    .map((c) => c.node);
  if (level === "errors") return traceTree(retainErrorPaths(roots), traceId);
  if (level === "summary") return traceTree(pruneSummary(roots), traceId);
  return traceTree(roots, traceId);
}

function isErrorOutcome(node: TraceNode): boolean {
  return node.outcome.kind === "threw" || node.outcome.kind === "incomplete";
}

function withChildren(node: TraceNode, children: readonly TraceNode[]): TraceNode {
  return traceNode(
    node.signature,
    node.outcome,
    children,
    node.durationMs,
    node.startTimeMs,
    node.concurrency,
    node.spanContext,
  );
}

// ERRORS: keep every error node with its full subtree, keep ancestors that have an error
// descendant (pruned to only the error path), drop pure-success branches (Java retainErrorPaths).
//
// Explicit-stack (non-recursive) post-order build, depth-bounded via TreeWalk. The flat enter/exit
// event stream this tree is always assembled from makes it structurally cycle-free, but a stream
// deep enough — a deliberately hostile one, or just a genuinely deep recursive traced application —
// still overflows ordinary call-stack recursion well short of any reasonable depth cap, and this
// runs during tree construction, before any renderer's own bound ever gets a chance to apply. A
// node past the depth limit is kept whole and unpruned, the same rule an error node's subtree
// already gets, rather than crashing the build.
function retainErrorPaths(nodes: readonly TraceNode[]): TraceNode[] {
  const result: TraceNode[] = [];
  for (const node of nodes) {
    const pruned = retainErrorPathsNode(node);
    if (pruned !== null) result.push(pruned);
  }
  return result;
}

interface RetainFrame {
  readonly node: TraceNode;
  readonly kept: TraceNode[];
  index: number;
}

function retainErrorPathsNode(node: TraceNode): TraceNode | null {
  if (isErrorOutcome(node)) return node;
  const walk = new TreeWalk<TraceNode>();
  if (walk.enter(node) !== undefined) return node;
  const stack: RetainFrame[] = [{ node, kept: [], index: 0 }];
  let result: TraceNode | null = null;
  while (stack.length > 0) result = stepRetainFrame(stack, walk);
  return result;
}

function stepRetainFrame(stack: RetainFrame[], walk: TreeWalk<TraceNode>): TraceNode | null {
  const frame = stack[stack.length - 1] as RetainFrame;
  if (frame.index < frame.node.children.length) {
    descendRetainFrame(frame, stack, walk);
    return null;
  }
  return finishRetainFrame(stack, walk);
}

// A child that is itself an error, or one the depth/cycle guard stops at, is kept whole and
// unpruned (the same rule the root of `retainErrorPathsNode` uses) rather than visited further.
function descendRetainFrame(
  frame: RetainFrame,
  stack: RetainFrame[],
  walk: TreeWalk<TraceNode>,
): void {
  const child = frame.node.children[frame.index++] as TraceNode;
  if (isErrorOutcome(child) || walk.enter(child) !== undefined) {
    frame.kept.push(child);
    return;
  }
  stack.push({ node: child, kept: [], index: 0 });
}

function finishRetainFrame(stack: RetainFrame[], walk: TreeWalk<TraceNode>): TraceNode | null {
  const frame = stack.pop() as RetainFrame;
  walk.exit(frame.node);
  const result = frame.kept.length === 0 ? null : withChildren(frame.node, frame.kept);
  const parent = stack[stack.length - 1];
  if (parent && result !== null) parent.kept.push(result);
  return result;
}

// SUMMARY: keep root + leaves and error frames, collapsing intermediate successful frames
// (Java pruneSummary / pruneSummaryCollect). Bounded and cycle-safe via `walkPreOrder`, for the
// same reason `retainErrorPaths` above needs `TreeWalk`: depth alone is enough to overflow ordinary
// call-stack recursion here, well before any renderer sees this tree.
function pruneSummary(roots: readonly TraceNode[]): TraceNode[] {
  return roots.map((root) => withChildren(root, collectSummaryChildren(root.children)));
}

// An error node's children are never visited (its whole subtree is kept as one summary leaf); a
// node the depth/cycle guard stops at is treated the same way, for the reason given above.
function summaryDescendants(node: TraceNode): readonly TraceNode[] {
  return isErrorOutcome(node) ? [] : node.children;
}

function collectSummaryChildren(children: readonly TraceNode[]): TraceNode[] {
  const collector: TraceNode[] = [];
  walkPreOrder(children, summaryDescendants, (node, stop) => {
    if (stop !== undefined || summaryDescendants(node).length === 0) collector.push(node);
  });
  return collector;
}
