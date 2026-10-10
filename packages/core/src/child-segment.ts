// SPDX-License-Identifier: BUSL-1.1
// Licensed under the Business Source License 1.1 (see LICENSE); Change Date: four years from publication; Change License: Apache-2.0
// Copyright (c) 2026 Empower Agile
import type { ConcurrencyKind } from "./concurrency-info.js";
import type { TraceNode } from "./trace-node.js";

export type ChildSegment =
  | { readonly kind: "sequential"; readonly node: TraceNode }
  | {
      readonly kind: ConcurrencyKind;
      readonly groupId: string;
      readonly members: readonly TraceNode[];
    };

type GroupAccumulator = { groupId: string; kind: ConcurrencyKind; members: TraceNode[] };

export function partitionChildren(children: readonly TraceNode[]): readonly ChildSegment[] {
  const segments: ChildSegment[] = [];
  let group: GroupAccumulator | null = null;

  for (const child of children) {
    const conc = child.concurrency;
    if (conc && conc.groupId === group?.groupId) {
      group.members.push(child);
    } else {
      group = flushGroup(group, segments);
      if (conc) {
        group = { groupId: conc.groupId, kind: conc.kind, members: [child] };
      } else {
        segments.push({ kind: "sequential", node: child });
      }
    }
  }
  flushGroup(group, segments);
  return segments;
}

function flushGroup(group: GroupAccumulator | null, segments: ChildSegment[]): null {
  if (group) segments.push(finalizeGroup(group));
  return null;
}

function finalizeGroup(group: {
  groupId: string;
  kind: ConcurrencyKind;
  members: TraceNode[];
}): ChildSegment {
  return { kind: group.kind, groupId: group.groupId, members: group.members };
}

/** A node together with the citable span id its renderer prints for it (`citable-span-id.ts`). */
export type CitedNode = { readonly node: TraceNode; readonly id: string };

/**
 * One render operation flattened from a partitioned child list: a single node to descend into
 * (a sequential child, or one member of a fire-and-forget/adopted-async group — neither is a fork
 * the caller awaited, so both render inline, same as a sequential child), or a fork/join group to
 * render as its own block without descending into any member's own children. Every node carries
 * its citable span id, so a renderer whose layout differs from the structural `.nt`'s still cites
 * each span by the id the `.nt` gives it.
 */
export type FlatChildOp =
  | { readonly kind: "node"; readonly node: TraceNode; readonly id: string }
  | { readonly kind: "fork-join"; readonly members: readonly CitedNode[] };

function segmentToOps(
  segment: ChildSegment,
  cite: (node: TraceNode) => CitedNode,
): readonly FlatChildOp[] {
  if (segment.kind === "sequential") return [{ kind: "node", ...cite(segment.node) }];
  if (segment.kind === "fork-join")
    return [{ kind: "fork-join", members: segment.members.map(cite) }];
  return segment.members.map((node) => ({ kind: "node" as const, ...cite(node) }));
}

/**
 * Flattens a node's children into the linear sequence of render operations every recursive
 * renderer descends through — whether via native recursion or an explicit stack (see
 * `tree-walk.ts`'s `TreeWalk`, which every renderer using this pairs with for the descent bound).
 *
 * @param ids the span id of every child, index for index (`CitableSpanId.idsOf`); partitioning
 * keeps capture order, so the n-th child met here takes the n-th id.
 */
export function flattenChildOps(
  children: readonly TraceNode[],
  ids: readonly string[],
): readonly FlatChildOp[] {
  let next = 0;
  const cite = (node: TraceNode): CitedNode => ({ node, id: ids[next++] as string });
  return partitionChildren(children).flatMap((segment) => segmentToOps(segment, cite));
}
