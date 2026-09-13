// SPDX-License-Identifier: BUSL-1.1
// Licensed under the Business Source License 1.1 (see LICENSE); Change Date: four years from publication; Change License: Apache-2.0
// Copyright (c) 2026 Empower Agile
import { partitionChildren } from "./child-segment.js";
import { ControlEscape } from "./control-escape.js";
import { errorTypeName } from "./error-display.js";
import type { TraceNode } from "./trace-node.js";
import type { TraceOutcome } from "./trace-outcome.js";
import type { TraceTree } from "./trace-tree.js";
import { TREE_WALK_MARKER, TreeWalk } from "./tree-walk.js";

/**
 * Renders the AI-safe structural trace artifact (`.nt`, ADR-002): the developer-authored shape of a
 * scenario with zero runtime values.
 *
 * INTENT: one artifact per test scenario containing only code structure — class, method and
 * parameter *names*, the call hierarchy, and outcome *kinds*. No argument or return values, no
 * exception messages, no durations, no timestamps, no trace identifiers. Zero runtime values means
 * zero prompt-injection surface and zero PII, and the output is deterministic byte-for-byte for
 * identical behavior — the property that makes it the approval-testing baseline (`.approved.nt`)
 * and the cross-runtime conformance-fixture format. Port of Java `render.StructuralTraceRenderer`.
 *
 * @param tree the captured trace.
 * @returns the structural document body (no `scenario:` header); an empty tree yields `""`.
 */
export function renderStructural(tree: TraceTree): string {
  return planAndRenderRoots(tree.roots);
}

/**
 * Full artifact form: a `scenario:` header (the humanized/invocation-numbered title — stable across
 * runs) plus a blank line, followed by the structural call flow. Nothing else — no result, no ids,
 * no dates — so the file changes only when behavior changes.
 */
export function renderStructuralDocument(tree: TraceTree, scenario: string): string {
  return `scenario: ${ControlEscape.sanitize(scenario)}\n\n${renderStructural(tree)}`;
}

/**
 * Value-free structural key for a single subtree: equal signature sequence, equal child shape
 * recursively, and equal outcome kind at every node. Exposed so a future loop-folding "sameness
 * oracle" can share the exact same definition of "same shape" as the `.nt` artifact — never a
 * separate, driftable comparison.
 */
export function structuralSubtreeKey(node: TraceNode): string {
  return planAndRenderRoots([node]);
}

/** One node queued for rendering: its depth, and text to print immediately before/after it. */
interface Planned {
  readonly node: TraceNode;
  readonly depth: number;
  readonly leading?: string | undefined;
  trailing?: string | undefined;
}

/**
 * One level of the explicit render stack: the owner whose children these items came from (`null`
 * for the synthetic top-level frame holding the roots — no {@link TreeWalk.exit} needed for it, and
 * no trailing text to print), the queued siblings, and our position in them.
 */
interface StructuralFrame {
  readonly owner: TraceNode | null;
  readonly trailing?: string | undefined;
  readonly items: readonly Planned[];
  index: number;
}

interface PlanResult {
  readonly items: Planned[];
  readonly carry: string;
}

/** Mutable box for `carry`, so the per-segment planners below can share and drain one accumulator. */
interface CarryBox {
  value: string;
}

/** Consumes and returns the boxed carry text, or `undefined` when there is none to attach. */
function flush(carry: CarryBox): string | undefined {
  if (carry.value === "") return undefined;
  const text = carry.value;
  carry.value = "";
  return text;
}

function planSegment(
  segment: ReturnType<typeof partitionChildren>[number],
  depth: number,
  items: Planned[],
  carry: CarryBox,
): void {
  if (segment.kind === "sequential") {
    items.push({ node: segment.node, depth, leading: flush(carry) });
  } else if (segment.kind === "fire-and-forget") {
    planFireAndForget(segment.members[0] as TraceNode, depth, items, carry);
  } else {
    planGroup(
      segment.kind === "async" ? "~ async" : "~ fork",
      segment.members,
      depth,
      items,
      carry,
    );
  }
}

function planFireAndForget(
  launcher: TraceNode,
  depth: number,
  items: Planned[],
  carry: CarryBox,
): void {
  carry.value += `${"  ".repeat(depth)}~ fire-and-forget\n`;
  for (const [i, child] of launcher.children.entries()) {
    items.push({ node: child, depth: depth + 1, leading: i === 0 ? flush(carry) : undefined });
  }
}

function planGroup(
  marker: string,
  members: readonly TraceNode[],
  depth: number,
  items: Planned[],
  carry: CarryBox,
): void {
  carry.value += `${"  ".repeat(depth)}${marker} [${members.length}]\n`;
  for (const [i, member] of sortBySignature(members).entries()) {
    items.push({ node: member, depth: depth + 1, leading: i === 0 ? flush(carry) : undefined });
  }
}

/**
 * Concurrent groups render under a marker (`~ fork [n]`, `~ async [n]`) with members sorted by
 * `Class.method` — capture order across threads is the scheduler's choice, not behaviour, and this
 * artifact must be byte-identical for identical behavior. Thread identity is runtime data and never
 * appears. A fire-and-forget launcher renders `~ fire-and-forget` and is itself skipped: only its
 * children are queued, at the launcher's own depth plus one — the launch is not itself a call the
 * developer wrote in this scenario's shape, only the work it started is.
 *
 * @remarks `carry` accumulates marker text that has no queued node yet (an empty fire-and-forget
 * group produces none at all); it becomes the next node's `leading` the moment one exists, is
 * attached to the last queued node's `trailing` otherwise (see {@link attachCarry}), or — when the
 * whole sibling list queued no node at all — is spliced straight into the output.
 */
function planChildren(children: readonly TraceNode[], depth: number): PlanResult {
  const items: Planned[] = [];
  const carry: CarryBox = { value: "" };
  for (const segment of partitionChildren(children)) {
    planSegment(segment, depth, items, carry);
  }
  return { items, carry: carry.value };
}

function sortBySignature(members: readonly TraceNode[]): readonly TraceNode[] {
  return [...members].sort((a, b) => {
    const ka = signatureKey(a);
    const kb = signatureKey(b);
    // Ordinal (code-unit) comparison — byte-stable across ICU locales (Java String.compareTo).
    return ka < kb ? -1 : ka > kb ? 1 : 0;
  });
}

function signatureKey(node: TraceNode): string {
  return `${node.signature.className}.${node.signature.methodName}`;
}

function outcomeSuffix(outcome: TraceOutcome): string {
  if (outcome.kind === "returned") return outcome.renderedValue !== null ? " → value" : "";
  if (outcome.kind === "threw") return ` !! ${errorTypeName(outcome.error)}`;
  return " ?? incomplete";
}

function appendLine(node: TraceNode, depth: number, marker: string | undefined): string {
  const { className, methodName, parameters } = node.signature;
  const params = parameters.map((p) => ControlEscape.sanitize(p.name)).join(", ");
  const call = `${ControlEscape.sanitize(className)}.${ControlEscape.sanitize(methodName)}(${params})`;
  const markerText = marker !== undefined ? ` ${marker}` : "";
  return `${"  ".repeat(depth)}- ${call}${outcomeSuffix(node.outcome)}${markerText}\n`;
}

/**
 * Attaches `carry` (leftover marker text with no node of its own — an empty concurrent group) to
 * the render: the trailing text of the last queued item if there is one, otherwise straight onto
 * the output, since nothing else will ever print it (Java `flushCarryToLast`).
 */
function attachCarry(plan: PlanResult, out: { text: string }): void {
  if (plan.carry === "") return;
  const last = plan.items[plan.items.length - 1];
  if (last === undefined) {
    out.text += plan.carry;
    return;
  }
  last.trailing = (last.trailing ?? "") + plan.carry;
}

/**
 * Explicit-stack (non-recursive), cycle-safe and depth-bounded pre-order render of a call forest.
 * Mirrors `markdown-renderer.ts`/`indented-text-renderer.ts`'s own explicit-stack shape: a queued
 * item's own line always prints first ("contributes itself" even when the walk refuses to descend
 * further), and `leading`/`trailing` text — concurrency-group markers — is spliced in around it.
 */
function planAndRenderRoots(roots: readonly TraceNode[]): string {
  const walk = new TreeWalk<TraceNode>();
  const out = { text: "" };
  const rootPlan = planChildren(roots, 0);
  attachCarry(rootPlan, out);
  const stack: StructuralFrame[] = [{ owner: null, items: rootPlan.items, index: 0 }];
  while (stack.length > 0) {
    stepFrame(stack, walk, out);
  }
  return out.text;
}

/** The frame is exhausted: step back out of its owner (if any) and print its trailing text. */
function exitFrame(frame: StructuralFrame, walk: TreeWalk<TraceNode>, out: { text: string }): void {
  if (!frame.owner) return;
  walk.exit(frame.owner);
  if (frame.trailing !== undefined) out.text += frame.trailing;
}

/** The first (and only) visit to a queued item: prints its own line, then descends or stops. */
function enterItem(
  item: Planned,
  stack: StructuralFrame[],
  walk: TreeWalk<TraceNode>,
  out: { text: string },
): void {
  if (item.leading !== undefined) out.text += item.leading;
  const stop = walk.enter(item.node);
  if (stop !== undefined) {
    // TreeWalk never descends into a stopped node's children, so trailing text — normally printed
    // once the subtree finishes — is appended right here instead; a stopped node is a leaf either way.
    out.text += appendLine(item.node, item.depth, TREE_WALK_MARKER[stop]);
    if (item.trailing !== undefined) out.text += item.trailing;
    return;
  }
  out.text += appendLine(item.node, item.depth, undefined);
  const childPlan = planChildren(item.node.children, item.depth + 1);
  attachCarry(childPlan, out);
  stack.push({ owner: item.node, trailing: item.trailing, items: childPlan.items, index: 0 });
}

function stepFrame(
  stack: StructuralFrame[],
  walk: TreeWalk<TraceNode>,
  out: { text: string },
): void {
  const frame = stack[stack.length - 1] as StructuralFrame;
  if (frame.index >= frame.items.length) {
    exitFrame(frame, walk, out);
    stack.pop();
    return;
  }
  enterItem(frame.items[frame.index++] as Planned, stack, walk, out);
}
