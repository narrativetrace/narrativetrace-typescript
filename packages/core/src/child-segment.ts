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

/**
 * One render operation flattened from a partitioned child list: a single node to descend into
 * (a sequential child, or one member of a fire-and-forget/adopted-async group — neither is a fork
 * the caller awaited, so both render inline, same as a sequential child), or a fork/join group to
 * render as its own block without descending into any member's own children.
 */
export type FlatChildOp =
  | { readonly kind: "node"; readonly node: TraceNode }
  | { readonly kind: "fork-join"; readonly members: readonly TraceNode[] };

function segmentToOps(segment: ChildSegment): readonly FlatChildOp[] {
  if (segment.kind === "sequential") return [{ kind: "node", node: segment.node }];
  if (segment.kind === "fork-join") return [{ kind: "fork-join", members: segment.members }];
  return segment.members.map((node) => ({ kind: "node" as const, node }));
}

/**
 * Flattens a node's children into the linear sequence of render operations every recursive
 * renderer descends through — whether via native recursion or an explicit stack (see
 * `tree-walk.ts`'s `TreeWalk`, which every renderer using this pairs with for the descent bound).
 */
export function flattenChildOps(children: readonly TraceNode[]): readonly FlatChildOp[] {
  return partitionChildren(children).flatMap(segmentToOps);
}
