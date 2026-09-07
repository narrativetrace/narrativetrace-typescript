// SPDX-License-Identifier: BUSL-1.1
// Licensed under the Business Source License 1.1 (see LICENSE); Change Date: four years from publication; Change License: Apache-2.0
// Copyright (c) 2026 Empower Agile
import { type FlatChildOp, flattenChildOps } from "./child-segment.js";
import { ControlEscape } from "./control-escape.js";
import { errorMessage, errorTypeName } from "./error-display.js";
import { MarkdownEscape } from "./markdown-escape.js";
import { displayParamValue, type ParameterCapture } from "./parameter-capture.js";
import { analyze } from "./sequential-async-detector.js";
import type { TraceId } from "./span-id-generator.js";
import { humanName } from "./trace-namer.js";
import type { TraceNode } from "./trace-node.js";
import type { Threw } from "./trace-outcome.js";
import type { TraceTree } from "./trace-tree.js";
import { TREE_WALK_MARKER, TreeWalk, walkPreOrder } from "./tree-walk.js";
import { ValueReferenceIndex } from "./value-reference-index.js";

/**
 * Rendering knobs for the Markdown emitters. `scenarioName` populates the frontmatter `scenario:`
 * key; `slowThresholdMs` is the duration above which a node is flagged ` ⚠️ slow`.
 *
 * @defaultValue `slowThresholdMs` defaults to 200ms when omitted.
 */
export type MarkdownOptions = {
  readonly scenarioName?: string;
  readonly slowThresholdMs?: number;
};

/** Metadata for the Markdown document header (Java `TraceMetadata`). */
export type MarkdownDocumentMetadata = {
  readonly scenario: string;
  readonly result: string;
};

function traceNameLines(tree: TraceTree): string[] {
  const traceId = tree.roots[0]?.spanContext?.traceId;
  if (!traceId) return [];
  return [`trace_id: ${traceId}`, `trace_name: ${humanName(traceId as TraceId)}`];
}

// YAML's own printable set is narrower than "not a control character": C0/C1 controls, lone
// surrogates and the U+FFFE/U+FFFF noncharacters are all rejected by a real YAML parser even
// though only \n is an ASCII control most code reaches for.
function isYamlUnsafeCodePoint(code: number): boolean {
  if (code <= 0x1f || (code >= 0x7f && code <= 0x9f)) return true;
  if (code >= 0xd800 && code <= 0xdfff) return true;
  return code === 0xfffe || code === 0xffff;
}

function containsYamlUnsafeCodePoint(value: string): boolean {
  for (const ch of value) {
    if (isYamlUnsafeCodePoint(ch.codePointAt(0) ?? 0)) return true;
  }
  return false;
}

const YAML_LEADING_INDICATOR = /^[-?:,[\]{}#&*!|>'"%@`]/;

// A plain YAML scalar cannot start with a flow/block indicator, hold ": "/"#"/a quote/a
// backslash, carry a literal control character, or be empty/have leading-or-trailing whitespace —
// an allow-list, not the deny-list this used to be — the same fix every runtime carries.
function needsYamlQuoting(value: string): boolean {
  if (value.length === 0 || value !== value.trim()) return true;
  if (YAML_LEADING_INDICATOR.test(value) || /[:#"\\]/.test(value)) return true;
  return containsYamlUnsafeCodePoint(value);
}

function yamlEscapeChar(ch: string): string {
  const code = ch.codePointAt(0) ?? 0;
  if (ch === "\\") return "\\\\";
  if (ch === '"') return '\\"';
  if (ch === "\n") return "\\n";
  if (ch === "\t") return "\\t";
  if (ch === "\r") return "\\r";
  return isYamlUnsafeCodePoint(code) ? `\\u${code.toString(16).padStart(4, "0")}` : ch;
}

// Quotes and escapes a scenario/entry-point value that would otherwise produce malformed or
// attacker-shaped YAML frontmatter.
function yamlSafe(value: string): string {
  if (!needsYamlQuoting(value)) return value;
  return `"${[...value].map(yamlEscapeChar).join("")}"`;
}

// className/methodName are trace metadata, not a captured value — this was the one frontmatter
// field that bypassed yamlSafe entirely, so a hostile class/method name injected sibling YAML
// keys (cross-runtime shape F4, 2026-09-02 audit — the most serious instance Java's own audit found).
function entryPointLines(tree: TraceTree): string[] {
  const root = tree.roots[0];
  if (!root) return [];
  const { className, methodName } = root.signature;
  return [
    `entry_point: ${yamlSafe(`${className}.${methodName}`)}`,
    `duration_ms: ${root.durationMs}`,
  ];
}

// YAML frontmatter: type/scenario/entry_point/duration_ms/
// trace identity/method_count/error_count. `result` moved to the document header (Java parity).
function renderFrontmatter(tree: TraceTree, options?: MarkdownOptions): string[] {
  return [
    "---",
    "type: trace",
    ...(options?.scenarioName ? [`scenario: ${yamlSafe(options.scenarioName)}`] : []),
    ...entryPointLines(tree),
    ...traceNameLines(tree),
    `method_count: ${countMethods(tree.roots)}`,
    `error_count: ${countErrors(tree.roots)}`,
    "---",
  ];
}

function renderBody(tree: TraceTree, options?: MarkdownOptions): string[] {
  const lines: string[] = [];
  const refs = ValueReferenceIndex.build(tree);
  renderTree(tree.roots, lines, refs, options);
  return lines;
}

/** Body-only Markdown (no `---` frontmatter fences), Java `MarkdownRenderer.render`. */
export function renderMarkdownBody(tree: TraceTree, options?: MarkdownOptions): string {
  return renderBody(tree, options).join("\n");
}

/**
 * Renders a full Markdown trace: YAML frontmatter (type, scenario, entry point, trace identity,
 * method/error counts) followed by the nested call-flow body.
 *
 * INTENT: the default artifact for a captured trace. Use {@link renderMarkdownBody} for body-only
 * output, or {@link renderMarkdownDocument} when you want a `## Trace:` header with an explicit
 * result.
 *
 * @param options frontmatter scenario name and the slow-node threshold; see {@link MarkdownOptions}.
 */
export function renderMarkdown(tree: TraceTree, options?: MarkdownOptions): string {
  return [...renderFrontmatter(tree, options), "", ...renderBody(tree, options)].join("\n");
}

function documentHeader(tree: TraceTree, metadata: MarkdownDocumentMetadata): string[] {
  const root = tree.roots[0];
  if (!root) return [];
  const className = ControlEscape.sanitize(root.signature.className);
  const methodName = ControlEscape.sanitize(root.signature.methodName);
  return [
    "",
    `## Trace: ${className}.${methodName}`,
    "",
    `**Scenario:** ${metadata.scenario}`,
    `**Duration:** ${root.durationMs}ms | **Result:** ${metadata.result}`,
    "",
    "### Call Flow",
    "",
  ];
}

/**
 * Full Markdown document (Java `MarkdownRenderer.renderDocument`): frontmatter, a `## Trace:` header
 * with scenario/duration/result, a `### Call Flow` heading, then the node body.
 */
export function renderMarkdownDocument(
  tree: TraceTree,
  metadata: MarkdownDocumentMetadata,
  options?: MarkdownOptions,
): string {
  return [
    ...renderFrontmatter(tree, { ...options, scenarioName: metadata.scenario }),
    ...documentHeader(tree, metadata),
    ...renderBody(tree, options),
  ].join("\n");
}

/**
 * One node's place on the explicit render stack: the owner whose children these ops came from
 * (`null` for the synthetic top-level frame holding the roots — no {@link TreeWalk.exit} needed for
 * it) and the flattened per-node/fork-join operations still to process at this depth.
 */
interface RenderFrame {
  readonly depth: number;
  readonly owner: TraceNode | null;
  readonly ops: readonly FlatChildOp[];
  index: number;
}

function pushNodeLine(
  node: TraceNode,
  depth: number,
  lines: string[],
  refs: ValueReferenceIndex,
  options?: MarkdownOptions,
): void {
  const indent = "  ".repeat(depth);
  lines.push(`${indent}- ${formatCall(node, refs)}${formatOutcome(node, refs, options)}`);
  if (node.signature.narration) {
    const narration = MarkdownEscape.text(ControlEscape.sanitize(node.signature.narration));
    lines.push(`${indent}  *${narration}*`);
  }
}

// The first (and only) visit to a "node" op: renders the node's own line — it "contributes itself"
// regardless of the guard — then either pushes a frame to descend into its children, or (stopped)
// renders the depth-limit/cycle marker in their place.
function descendRenderNode(
  node: TraceNode,
  depth: number,
  stack: RenderFrame[],
  walk: TreeWalk<TraceNode>,
  lines: string[],
  refs: ValueReferenceIndex,
  options?: MarkdownOptions,
): void {
  pushNodeLine(node, depth, lines, refs, options);
  const stop = walk.enter(node);
  if (stop !== undefined) {
    lines.push(`${"  ".repeat(depth + 1)}- ${TREE_WALK_MARKER[stop]}`);
    return;
  }
  stack.push({ depth: depth + 1, owner: node, ops: flattenChildOps(node.children), index: 0 });
}

function stepRenderFrame(
  stack: RenderFrame[],
  walk: TreeWalk<TraceNode>,
  lines: string[],
  refs: ValueReferenceIndex,
  options?: MarkdownOptions,
): void {
  const frame = stack[stack.length - 1] as RenderFrame;
  if (frame.index >= frame.ops.length) {
    if (frame.owner) walk.exit(frame.owner);
    stack.pop();
    return;
  }
  const op = frame.ops[frame.index++] as FlatChildOp;
  if (op.kind === "fork-join") {
    renderForkJoinSegment(op.members, frame.depth, lines, refs, options);
    return;
  }
  descendRenderNode(op.node, frame.depth, stack, walk, lines, refs, options);
}

// Explicit-stack (non-recursive) pre-order walk of the call tree, bounded and cycle-safe via
// TreeWalk. Fork/join segments never recurse into their members' own children (existing behaviour,
// unrelated to this bound — only "node" ops ever grow the stack), so this alone is enough to keep
// a hand-built, replayed or deserialized tree — cyclic or merely very deep — from crashing or
// hanging renderMarkdown/renderMarkdownBody/renderMarkdownDocument.
function renderTree(
  roots: readonly TraceNode[],
  lines: string[],
  refs: ValueReferenceIndex,
  options?: MarkdownOptions,
): void {
  const walk = new TreeWalk<TraceNode>();
  const rootOps: FlatChildOp[] = roots.map((node) => ({ kind: "node", node }));
  const stack: RenderFrame[] = [{ depth: 0, owner: null, ops: rootOps, index: 0 }];
  while (stack.length > 0) {
    stepRenderFrame(stack, walk, lines, refs, options);
  }
}

function forkLabel(members: readonly TraceNode[], seqAsync: ReturnType<typeof analyze>): string {
  const base = `⑂ fork [${members.length} tasks]`;
  return seqAsync.isSequentialAsync ? `${base} [async, awaited sequentially]` : base;
}

function joinSuffix(seqAsync: ReturnType<typeof analyze>): string {
  if (!seqAsync.isSequentialAsync) return "";
  return ` ⚡ Sequential async: total ${seqAsync.totalMs}ms, parallelizable to ~${seqAsync.parallelizableMs}ms`;
}

// `(waited Xms for <slowest> after <fastest>)` when ≥2 members finished at different times
// (Java appendWaitAnalysis). Silent when a single member or all members share a duration.
function waitAnalysis(members: readonly TraceNode[]): string {
  if (members.length < 2) return "";
  let slowest = members[0] as TraceNode;
  let fastest = members[0] as TraceNode;
  for (const m of members) {
    if (m.durationMs > slowest.durationMs) slowest = m;
    if (m.durationMs < fastest.durationMs) fastest = m;
  }
  const waitMs = Math.round(slowest.durationMs - fastest.durationMs);
  if (waitMs <= 0) return "";
  const slow = ControlEscape.sanitize(slowest.signature.className);
  const fast = ControlEscape.sanitize(fastest.signature.className);
  return ` (waited ${waitMs}ms for ${slow} after ${fast})`;
}

function renderForkJoinSegment(
  members: readonly TraceNode[],
  depth: number,
  lines: string[],
  refs: ValueReferenceIndex,
  options?: MarkdownOptions,
): void {
  const indent = "  ".repeat(depth);
  const sorted = sortByLabel(members);
  const wallTime = Math.max(...members.map((m) => m.durationMs));
  const seqAsync = analyze(members);
  lines.push(`${indent}- ${forkLabel(members, seqAsync)}`);
  for (const m of sorted) {
    lines.push(`${indent}  - ↦ ${formatCall(m, refs)}${formatOutcome(m, refs, options)}`);
  }
  lines.push(
    `${indent}- ⑃ join — ${Math.round(wallTime)}ms${waitAnalysis(members)}${joinSuffix(seqAsync)}`,
  );
}

function sortByLabel(members: readonly TraceNode[]): readonly TraceNode[] {
  return [...members].sort((a, b) => {
    const la = `${a.signature.className}.${a.signature.methodName}`;
    const lb = `${b.signature.className}.${b.signature.methodName}`;
    // Ordinal (code-unit) comparison — byte-stable across ICU locales (Java String.compareTo),
    // unlike localeCompare which reorders by host locale.
    return la < lb ? -1 : la > lb ? 1 : 0;
  });
}

// A redacted capture keeps its marker without ever entering the reference index; only real
// captured values are deduplicated (Java ValueReferenceIndex.countNode skips redacted params).
function paramDisplay(param: ParameterCapture, refs: ValueReferenceIndex): string {
  return param.redacted ? displayParamValue(param) : refs.display(param.renderedValue);
}

// className/methodName/parameter names are trace metadata, not captured values — MarkdownEscape
// .code only widens the backtick fence, it does not fold control characters, so a raw newline
// here would still break out of the code span (cross-runtime shape F4, 2026-09-02 audit).
function formatCall(node: TraceNode, refs: ValueReferenceIndex): string {
  const { className, methodName, parameters } = node.signature;
  const params = parameters
    .map((p) => `${ControlEscape.sanitize(p.name)}: ${paramDisplay(p, refs)}`)
    .join(", ");
  return MarkdownEscape.code(
    `${ControlEscape.sanitize(className)}.${ControlEscape.sanitize(methodName)}(${params})`,
  );
}

function formatError(outcome: Threw): string {
  const type = MarkdownEscape.code(errorTypeName(outcome.error));
  const msg = MarkdownEscape.text(errorMessage(outcome.error));
  const context = outcome.errorContext
    ? ` — ${MarkdownEscape.text(ControlEscape.sanitize(outcome.errorContext))}`
    : "";
  return ` ❌ ${type}: ${msg}${context}`;
}

// `null` is the void-completion contract — a call that produced no value. Capture never renders
// `undefined` into a return any more, so there is no string to compare against here.
function formatReturn(renderedValue: string | null, refs: ValueReferenceIndex): string {
  if (renderedValue === null) return "";
  return ` → ${MarkdownEscape.code(refs.display(renderedValue))}`;
}

// Every timed node shows `— Nms`; a node whose duration strictly exceeds the threshold also
// gets ` ⚠️ slow` (Java renderDuration). Untimed nodes (duration 0) show nothing.
function formatDuration(node: TraceNode, threshold: number): string {
  if (node.durationMs === undefined || node.durationMs <= 0) return "";
  const slow = node.durationMs > threshold ? " ⚠️ slow" : "";
  return ` — ${node.durationMs}ms${slow}`;
}

function formatOutcomeBody(node: TraceNode, refs: ValueReferenceIndex): string {
  if (node.outcome.kind === "threw") return formatError(node.outcome);
  if (node.outcome.kind === "incomplete") return " ⏳ (incomplete)";
  return formatReturn(node.outcome.renderedValue, refs);
}

function formatOutcome(
  node: TraceNode,
  refs: ValueReferenceIndex,
  options?: MarkdownOptions,
): string {
  const threshold = options?.slowThresholdMs ?? 200;
  return `${formatOutcomeBody(node, refs)}${formatDuration(node, threshold)}`;
}

// Bounded, cycle-safe (walkPreOrder) — a hand-built or deserialized tree can hold an ancestor.
function countMethods(nodes: readonly TraceNode[]): number {
  let count = 0;
  walkPreOrder(
    nodes,
    (n) => n.children,
    () => {
      count++;
    },
  );
  return count;
}

function countErrors(nodes: readonly TraceNode[]): number {
  let count = 0;
  walkPreOrder(
    nodes,
    (n) => n.children,
    (node) => {
      if (node.outcome.kind === "threw") count++;
    },
  );
  return count;
}
