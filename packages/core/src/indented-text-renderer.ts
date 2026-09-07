// SPDX-License-Identifier: BUSL-1.1
// Licensed under the Business Source License 1.1 (see LICENSE); Change Date: four years from publication; Change License: Apache-2.0
// Copyright (c) 2026 Empower Agile
import { type FlatChildOp, flattenChildOps } from "./child-segment.js";
import { ControlEscape } from "./control-escape.js";
import { errorMessage, errorTypeName } from "./error-display.js";
import { displayParamValue } from "./parameter-capture.js";
import { analyze } from "./sequential-async-detector.js";
import type { TraceNode } from "./trace-node.js";
import type { TraceTree } from "./trace-tree.js";
import { TREE_WALK_MARKER, TreeWalk } from "./tree-walk.js";

/**
 * Renders a trace as an ASCII tree (`├──`/`└──`/`│` connectors), one line per call with its
 * outcome (`→ value`, `✗ Error: …`, or `⏳ (incomplete)`). Fork/join segments render a `⑂ fork`
 * header, sorted `↦` branches, and a `⑃ join — Nms` footer.
 *
 * INTENT: a dependency-free, terminal-friendly view for logs or console output.
 *
 * @returns the tree lines joined by `\n`; an empty tree yields an empty string.
 */
export function renderIndentedText(tree: TraceTree): string {
  const lines: string[] = [];
  renderTree(tree.roots, lines);
  return lines.join("\n");
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
  node: TraceNode,
  prefix: string,
  isLast: boolean,
  isRoot: boolean,
  stack: IndentedFrame[],
  walk: TreeWalk<TraceNode>,
  lines: string[],
): void {
  const [connector, childPrefix] = connectorPrefix(isRoot, isLast, prefix);
  lines.push(`${prefix}${connector}${formatCall(node)}`);
  const stop = walk.enter(node);
  if (stop !== undefined) {
    lines.push(`${childPrefix}└── ${TREE_WALK_MARKER[stop]}`);
    return;
  }
  stack.push({ owner: node, prefix: childPrefix, ops: flattenChildOps(node.children), index: 0 });
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
  descendIndentedNode(op.node, frame.prefix, isLast, isRoot, stack, walk, lines);
}

// Explicit-stack (non-recursive) pre-order walk, bounded and cycle-safe via TreeWalk — see
// markdown-renderer.ts's renderTree for the full rationale; this is the same shape.
function renderTree(roots: readonly TraceNode[], lines: string[]): void {
  const walk = new TreeWalk<TraceNode>();
  const rootOps: FlatChildOp[] = roots.map((node) => ({ kind: "node", node }));
  const stack: IndentedFrame[] = [{ owner: null, prefix: "", ops: rootOps, index: 0 }];
  while (stack.length > 0) {
    stepIndentedFrame(stack, walk, lines);
  }
}

function seqAsyncHint(seqAsync: ReturnType<typeof analyze>): string {
  if (!seqAsync.isSequentialAsync) return "";
  return ` ⚡ Sequential async: total ${seqAsync.totalMs}ms, parallelizable to ~${seqAsync.parallelizableMs}ms`;
}

function renderForkJoinBlock(
  members: readonly TraceNode[],
  prefix: string,
  isLast: boolean,
  lines: string[],
): void {
  const connector = isLast ? "└── " : "├── ";
  const sorted = sortMembers(members);
  const wallTime = Math.max(...members.map((m) => m.durationMs));
  const seqAsync = analyze(members);
  const seqTag = seqAsync.isSequentialAsync ? " [async, awaited sequentially]" : "";
  lines.push(`${prefix}${connector}⑂ fork [${members.length} tasks]${seqTag}`);
  const branchPrefix = prefix + (isLast ? "    " : "│   ");
  for (const m of sorted) {
    lines.push(`${branchPrefix}↦ ${formatCall(m)}`);
  }
  lines.push(
    `${prefix}${isLast ? "└── " : "├── "}⑃ join — ${Math.round(wallTime)}ms${seqAsyncHint(seqAsync)}`,
  );
}

function sortMembers(members: readonly TraceNode[]): readonly TraceNode[] {
  return [...members].sort((a, b) => {
    const la = `${a.signature.className}.${a.signature.methodName}`;
    const lb = `${b.signature.className}.${b.signature.methodName}`;
    // Ordinal (code-unit) comparison — byte-stable across ICU locales (Java String.compareTo).
    return la < lb ? -1 : la > lb ? 1 : 0;
  });
}

// className/methodName/parameter names are trace metadata, not captured values — unlike
// renderedValue (already control-escaped by value-renderer), nothing sanitizes them upstream, so
// each is escaped here (cross-port shape F4, 2026-09-02 audit).
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
