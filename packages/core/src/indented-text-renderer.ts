// SPDX-License-Identifier: BUSL-1.1
// Licensed under the Business Source License 1.1 (see LICENSE); Change Date: four years from publication; Change License: Apache-2.0
// Copyright (c) 2026 Empower Agile
import type { CitedNode, FlatChildOp } from "./child-segment.js";
import { CitableSpanId } from "./citable-span-id.js";
import { ControlEscape } from "./control-escape.js";
import { formatDurationMs } from "./duration-format.js";
import { errorMessage, errorTypeName } from "./error-display.js";
import { displayParamValue } from "./parameter-capture.js";
import { analyze } from "./sequential-async-detector.js";
import { humanName } from "./trace-namer.js";
import type { TraceNode } from "./trace-node.js";
import type { TraceTree } from "./trace-tree.js";
import { TREE_WALK_MARKER, TreeWalk } from "./tree-walk.js";

/**
 * Renders a trace as an ASCII tree (`├──`/`└──`/`│` connectors), one line per call with its
 * outcome (`→ value`, `✗ Error: …`, or `⏳ (incomplete)`) and, last, the call's citable span id
 * (`#1.2` — the id the structural `.nt` gives the same call, see `citable-span-id.ts`). Fork/join
 * segments render a `⑂ fork` header, sorted `↦` branches, and a `⑃ join — Nms` footer.
 *
 * INTENT: a dependency-free, terminal-friendly view for logs or console output. Opens with the
 * trace's own three-word phrase (`trace: bold elk soars (a1b2c3d)` — the phrase plus the first 7
 * hex characters of its id) whenever {@link TraceTree.traceId} is present; silent on an empty
 * tree, or a hand-built one that opted out of identity — nothing here is
 * invented. This is the trace's OWN name, unrelated to a test-suite run's name (see
 * `RunIdentity`); neither ever reaches the structural `.nt` text.
 *
 * @returns the tree lines joined by `\n`; an empty tree yields an empty string.
 */
export function renderIndentedText(tree: TraceTree): string {
  const lines: string[] = [];
  appendTraceHeader(tree, lines);
  renderTree(tree.roots, lines);
  return lines.join("\n");
}

function appendTraceHeader(tree: TraceTree, lines: string[]): void {
  const { traceId } = tree;
  if (traceId === undefined) return;
  lines.push(`trace: ${humanName(traceId)} (${traceId.slice(0, 7)})`, "");
}

/**
 * One node's place on the explicit render stack: the owner whose children these ops came from
 * (`null` for the synthetic top-level frame holding the roots — no connector, no {@link
 * TreeWalk.exit} needed), the indent prefix every op at this level renders with, and how far into
 * the ops we've gotten.
 */
interface IndentedFrame {
  readonly owner: TraceNode | null;
  readonly prefix: string;
  readonly ops: readonly FlatChildOp[];
  index: number;
}

function connectorPrefix(isRoot: boolean, isLast: boolean, prefix: string): [string, string] {
  const connector = isRoot ? "" : isLast ? "└── " : "├── ";
  const childPrefix = isRoot ? "" : prefix + (isLast ? "    " : "│   ");
  return [connector, childPrefix];
}

// The first (and only) visit to a "node" op: its own line prints regardless of the guard
// ("contributes itself"); a stopped node gets a marker leaf instead of descending.
function descendIndentedNode(
  { node, id }: CitedNode,
  prefix: string,
  isLast: boolean,
  isRoot: boolean,
  stack: IndentedFrame[],
  walk: TreeWalk<TraceNode>,
  lines: string[],
): void {
  const [connector, childPrefix] = connectorPrefix(isRoot, isLast, prefix);
  lines.push(`${prefix}${connector}${formatCall(node)} ${id}`);
  const stop = walk.enter(node);
  if (stop !== undefined) {
    lines.push(`${childPrefix}└── ${TREE_WALK_MARKER[stop]}`);
    return;
  }
  const ops = CitableSpanId.citedOps(node.children, id);
  stack.push({ owner: node, prefix: childPrefix, ops, index: 0 });
}

function stepIndentedFrame(
  stack: IndentedFrame[],
  walk: TreeWalk<TraceNode>,
  lines: string[],
): void {
  const frame = stack[stack.length - 1] as IndentedFrame;
  if (frame.index >= frame.ops.length) {
    if (frame.owner) walk.exit(frame.owner);
    stack.pop();
    return;
  }
  const isLast = frame.index === frame.ops.length - 1;
  const op = frame.ops[frame.index++] as FlatChildOp;
  const isRoot = frame.owner === null;
  if (op.kind === "fork-join") {
    renderForkJoinBlock(op.members, frame.prefix, isLast, lines);
    return;
  }
  descendIndentedNode(op, frame.prefix, isLast, isRoot, stack, walk, lines);
}

// Explicit-stack (non-recursive) pre-order walk, bounded and cycle-safe via TreeWalk — see
// markdown-renderer.ts's renderTree for the full rationale; this is the same shape.
function renderTree(roots: readonly TraceNode[], lines: string[]): void {
  const walk = new TreeWalk<TraceNode>();
  const ids = CitableSpanId.idsOf(roots, null);
  const rootOps: FlatChildOp[] = roots.map((node, i) => ({
    kind: "node",
    node,
    id: ids[i] as string,
  }));
  const stack: IndentedFrame[] = [{ owner: null, prefix: "", ops: rootOps, index: 0 }];
  while (stack.length > 0) {
    stepIndentedFrame(stack, walk, lines);
  }
}

function seqAsyncHint(seqAsync: ReturnType<typeof analyze>): string {
  if (!seqAsync.isSequentialAsync) return "";
  return ` ⚡ Sequential async: total ${formatDurationMs(seqAsync.totalMs)}, parallelizable to ~${formatDurationMs(seqAsync.parallelizableMs)}`;
}

function renderForkJoinBlock(
  cited: readonly CitedNode[],
  prefix: string,
  isLast: boolean,
  lines: string[],
): void {
  const connector = isLast ? "└── " : "├── ";
  const members = cited.map((member) => member.node);
  const wallTime = Math.max(...members.map((m) => m.durationMs));
  const seqAsync = analyze(members);
  const seqTag = seqAsync.isSequentialAsync ? " [async, awaited sequentially]" : "";
  lines.push(`${prefix}${connector}⑂ fork [${members.length} tasks]${seqTag}`);
  pushBranches(cited, prefix + (isLast ? "    " : "│   "), lines);
  lines.push(
    `${prefix}${connector}⑃ join — ${formatDurationMs(wallTime)}${seqAsyncHint(seqAsync)}`,
  );
}

/** One `↦` line per fork member, in `Class.method` order, each citing its span id. */
function pushBranches(cited: readonly CitedNode[], branchPrefix: string, lines: string[]): void {
  for (const m of CitableSpanId.inIdOrder(cited)) {
    lines.push(`${branchPrefix}↦ ${formatCall(m.node)} ${m.id}`);
  }
}

// className/methodName/parameter names are trace metadata, not captured values — unlike
// renderedValue (already control-escaped by value-renderer), nothing sanitizes them upstream, so
// each is escaped here.
function formatCall(node: TraceNode): string {
  const { className, methodName, parameters } = node.signature;
  const params = parameters
    .map((p) => `${ControlEscape.sanitize(p.name)}: ${displayParamValue(p)}`)
    .join(", ");
  const call = `${ControlEscape.sanitize(className)}.${ControlEscape.sanitize(methodName)}(${params})`;

  if (node.outcome.kind === "threw") {
    const { error, errorContext } = node.outcome;
    const context = errorContext ? ` | ${ControlEscape.sanitize(errorContext)}` : "";
    return `${call} ✗ ${errorTypeName(error)}: ${errorMessage(error)}${context}`;
  }

  if (node.outcome.kind === "incomplete") return `${call} ⏳ (incomplete)`;

  // `null` is the void-completion contract — a call that produced no value to show.
  const ret = node.outcome.renderedValue;
  return ret === null ? call : `${call} → ${ret}`;
}
