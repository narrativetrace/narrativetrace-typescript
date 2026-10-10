// SPDX-License-Identifier: BUSL-1.1
// Licensed under the Business Source License 1.1 (see LICENSE); Change Date: four years from publication; Change License: Apache-2.0
// Copyright (c) 2026 Empower Agile
import {
  type CitedNode,
  type FlatChildOp,
  flattenChildOps,
  partitionChildren,
} from "./child-segment.js";
import type { TraceNode } from "./trace-node.js";

/**
 * The citable id of one span in a rendered trace: its position path in the tree, `#1`, `#1.3`,
 * `#1.3.2` (root call, its third child, that child's second child). Port of Java
 * `render.SpanId`; not to be confused with the W3C `SpanId` a capture mints
 * (`span-id-generator.ts`), which is random, stored, and never printed in a structural artifact.
 *
 * INTENT: an agent's report, a grader, an approval delta and a human review must be able to point
 * at the same span. The id is DERIVED from the tree by the renderer — never stored in the event
 * stream, never random — so two runs of the same flow give the same ids, and every flavour prints
 * the same id for the same span whatever its own layout.
 *
 * @remarks The numbering is the structural `.nt`'s layout (`documentation/structural-trace-format.md`):
 * every sibling list is numbered segment by segment — a plain call takes its capture-order
 * position; the members of one fork or async group take theirs in `Class.method` order (capture
 * order across threads is the scheduler's, so it can number nothing; equal signatures keep capture
 * order); a fire-and-forget launch takes ONE position, and the work it launched nests under that
 * position as a sibling list of its own. This runtime has no synthetic launcher node — the tree
 * builder tags each detached task's root span — so the members of a fire-and-forget segment ARE
 * the launched work, numbered `#P.1`, `#P.2`, … in capture order.
 */
export const CitableSpanId = {
  /**
   * The id of every node in `siblings`, index for index, for a renderer that walks them in capture
   * order rather than in the order ids are given in.
   *
   * @param siblings one node's children, or a tree's roots.
   * @param parent the id of the node they belong to; `null` for roots.
   */
  idsOf(siblings: readonly TraceNode[], parent: string | null): string[] {
    const ids: string[] = [];
    let position = 0;
    for (const segment of partitionChildren(siblings)) {
      position++;
      if (segment.kind === "sequential") ids.push(child(parent, position));
      else if (segment.kind === "fire-and-forget")
        ids.push(...launched(segment.members, parent, position));
      else position = addConcurrent(segment.members, parent, position, ids);
    }
    return ids;
  },

  /**
   * A sibling list as the render operations a text renderer walks (`flattenChildOps`), every node
   * carrying its span id.
   *
   * @param parent the id of the node `siblings` belong to; `null` for roots.
   */
  citedOps(siblings: readonly TraceNode[], parent: string | null): readonly FlatChildOp[] {
    return flattenChildOps(siblings, CitableSpanId.idsOf(siblings, parent));
  },

  /**
   * The order the members of one fork or async group take their ids in: `Class.method`, ordinal
   * (code-unit) comparison — byte-stable across ICU locales (Java `SpanId.CONCURRENT_ORDER`). A
   * stable sort keeps equal signatures in capture order.
   */
  concurrentOrder(left: TraceNode, right: TraceNode): number {
    return compareSignatures(left, right);
  },

  /**
   * Cited siblings in id order — for a renderer that prints a group's members in the order their
   * ids were given (siblings differ only in the last segment, compared as a number).
   */
  inIdOrder(cited: readonly CitedNode[]): CitedNode[] {
    return [...cited].sort((left, right) => lastPosition(left.id) - lastPosition(right.id));
  },

  /** The id of a child at a 1-based `position` under `parent`; a root when `parent` is `null`. */
  child(parent: string | null, position: number): string {
    return child(parent, position);
  },

  /**
   * `line` without its leading span id: `"  #1.2 - A.b()"` becomes `"  - A.b()"`. A line that
   * carries no id — a marker, a header, a baseline written before ids existed — is returned
   * unchanged, which is what lets an id-free `.approved.nt` still compare.
   */
  strip(line: string): string {
    const start = indentOf(line);
    const end = idEnd(line, start);
    return end === NO_ID ? line : line.slice(0, start) + line.slice(end + 1);
  },

  /** The span id `line` opens with (after its indent), or `undefined` when it carries none. */
  of(line: string): string | undefined {
    const start = indentOf(line);
    const end = idEnd(line, start);
    return end === NO_ID ? undefined : line.slice(start, end);
  },

  /** Whether `text` is exactly one span id: `#`, then dot-separated runs of ASCII digits. */
  isWellFormed(text: string): boolean {
    return WELL_FORMED_ID.test(text);
  },
} as const;

// Anchored, linear, no nested quantifier: a native scan, because the renderers validate one id per
// node and an id is as long as its node is deep — a char loop here made a deep chain quadratic.
const WELL_FORMED_ID = /^#[0-9]+(?:\.[0-9]+)*$/;

/** What {@link idEnd} answers when no well-formed id starts there. */
const NO_ID = -1;

function child(parent: string | null, position: number): string {
  return parent === null ? `#${position}` : `${parent}.${position}`;
}

/** The launched work of one fire-and-forget segment: under the launch's one position. */
function launched(
  members: readonly TraceNode[],
  parent: string | null,
  position: number,
): string[] {
  const launch = child(parent, position);
  return members.map((_member, index) => child(launch, index + 1));
}

/**
 * Numbers one fork or async group's members by `Class.method` (stable), listing them in capture
 * order. Returns the last position the group took.
 */
function addConcurrent(
  members: readonly TraceNode[],
  parent: string | null,
  first: number,
  ids: string[],
): number {
  const byRank = members.map((_member, index) => index);
  byRank.sort((left, right) =>
    compareSignatures(members[left] as TraceNode, members[right] as TraceNode),
  );
  const segmentIds: string[] = [];
  byRank.forEach((index, rank) => {
    segmentIds[index] = child(parent, first + rank);
  });
  ids.push(...segmentIds);
  return first + members.length - 1;
}

// Ordinal (code-unit) comparison — byte-stable across ICU locales (Java String.compareTo); the
// same order the structural renderer prints a group's members in.
function compareSignatures(left: TraceNode, right: TraceNode): number {
  const leftKey = `${left.signature.className}.${left.signature.methodName}`;
  const rightKey = `${right.signature.className}.${right.signature.methodName}`;
  return leftKey < rightKey ? -1 : leftKey > rightKey ? 1 : 0;
}

function lastPosition(id: string): number {
  return Number(id.slice(Math.max(id.lastIndexOf("."), id.lastIndexOf("#")) + 1));
}

function indentOf(line: string): number {
  let i = 0;
  while (line[i] === " ") i++;
  return i;
}

/**
 * Index of the space that ends an id starting at `start`, or {@link NO_ID} when there is no
 * well-formed id there (`#`, then dot-separated runs of ASCII digits, then one space).
 */
function idEnd(line: string, start: number): number {
  if (line[start] !== "#") return NO_ID;
  let digitsInRun = 0;
  for (let i = start + 1; i < line.length; i++) {
    const c = line[i] as string;
    if (c >= "0" && c <= "9") digitsInRun++;
    else if (c === "." && digitsInRun > 0) digitsInRun = 0;
    else return c === " " && digitsInRun > 0 ? i : NO_ID;
  }
  return NO_ID;
}
