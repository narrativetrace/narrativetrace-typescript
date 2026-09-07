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

function isVowel(ch: string): boolean {
  return "aeiou".includes(ch);
}

function splitCamelCase(name: string): string {
  return name.replace(/([a-z])([A-Z])/g, "$1 $2").toLowerCase();
}

function thirdPerson(verb: string): string {
  if (["ch", "sh", "ss", "x", "o"].some((s) => verb.endsWith(s))) {
    return `${verb}es`;
  }
  if (verb.endsWith("y") && !isVowel(verb.charAt(verb.length - 2))) {
    return `${verb.slice(0, -1)}ies`;
  }
  return `${verb}s`;
}

// className/methodName/parameter names are trace metadata, not captured values — unlike
// renderedValue (already control-escaped by value-renderer), nothing sanitizes them upstream, so
// each is escaped here before humanizing (cross-runtime shape F4, 2026-09-02 audit).
function humanizeClassName(name: string): string {
  return splitCamelCase(ControlEscape.sanitize(name));
}

function humanizeMethod(methodName: string): string {
  const words = splitCamelCase(methodName).split(" ");
  words[0] = thirdPerson(words[0]!);
  return words.join(" ");
}

// Base (infinitive) verb phrase for the "failed to <action>" form — no third-person conjugation.
function baseMethodPhrase(methodName: string): string {
  return splitCamelCase(methodName);
}

function isErrorOutcome(node: TraceNode): boolean {
  return node.outcome.kind === "threw" || node.outcome.kind === "incomplete";
}

function formatParams(node: TraceNode): string {
  const params = node.signature.parameters
    .map((p) => `${ControlEscape.sanitize(p.name)}: ${displayParamValue(p)}`)
    .join(", ");
  return params ? ` for ${params}` : "";
}

function formatOutcome(node: TraceNode): string {
  if (node.outcome.kind === "threw") {
    // Subject already reads "failed to <action>"; the closing names the type + message + context.
    const { error, errorContext } = node.outcome;
    const context = errorContext ? ` (${ControlEscape.sanitize(errorContext)})` : "";
    return ` — ${errorTypeName(error)}: ${errorMessage(error)}${context}`;
  }
  if (node.outcome.kind === "incomplete") return " — incomplete (no exit recorded)";
  // `null` is the void-completion contract — a call that produced no value to narrate.
  const ret = node.outcome.renderedValue;
  return ret === null ? "" : `, returning ${ret}`;
}

// "failed to <base verb>" for errors/incompletes (Java parity); third-person for success.
function actionPhrase(node: TraceNode): string {
  const methodName = ControlEscape.sanitize(node.signature.methodName);
  return isErrorOutcome(node)
    ? `failed to ${baseMethodPhrase(methodName)}`
    : humanizeMethod(methodName);
}

function pushSentence(node: TraceNode, sentences: string[]): void {
  const subject = `The ${humanizeClassName(node.signature.className)} ${actionPhrase(node)}`;
  sentences.push(`${subject}${formatParams(node)}${formatOutcome(node)}.`);
}

/** One node's place on the explicit render stack: its owner and the ops still to process. */
interface ProseFrame {
  readonly owner: TraceNode | null;
  readonly ops: readonly FlatChildOp[];
  index: number;
}

// The first (and only) visit to a "node" op: the node's own sentence prints regardless of the
// guard ("contributes itself"); a stopped node gets the marker sentence instead of descending.
function descendProseNode(
  node: TraceNode,
  stack: ProseFrame[],
  walk: TreeWalk<TraceNode>,
  sentences: string[],
): void {
  pushSentence(node, sentences);
  const stop = walk.enter(node);
  if (stop !== undefined) {
    sentences.push(TREE_WALK_MARKER[stop]);
    return;
  }
  stack.push({ owner: node, ops: flattenChildOps(node.children), index: 0 });
}

function stepProseFrame(stack: ProseFrame[], walk: TreeWalk<TraceNode>, sentences: string[]): void {
  const frame = stack[stack.length - 1] as ProseFrame;
  if (frame.index >= frame.ops.length) {
    if (frame.owner) walk.exit(frame.owner);
    stack.pop();
    return;
  }
  const op = frame.ops[frame.index++] as FlatChildOp;
  if (op.kind === "fork-join") {
    renderConcurrentBlock(op.members, sentences);
    return;
  }
  descendProseNode(op.node, stack, walk, sentences);
}

// Explicit-stack (non-recursive) pre-order walk, bounded and cycle-safe via TreeWalk — see
// markdown-renderer.ts's renderTree for the full rationale; this is the same shape.
function renderTree(roots: readonly TraceNode[], sentences: string[]): void {
  const walk = new TreeWalk<TraceNode>();
  const rootOps: FlatChildOp[] = roots.map((node) => ({ kind: "node", node }));
  const stack: ProseFrame[] = [{ owner: null, ops: rootOps, index: 0 }];
  while (stack.length > 0) {
    stepProseFrame(stack, walk, sentences);
  }
}

function renderConcurrentBlock(members: readonly TraceNode[], sentences: string[]): void {
  const labels = members.map(
    (m) =>
      `${ControlEscape.sanitize(m.signature.className)}.${ControlEscape.sanitize(m.signature.methodName)}`,
  );
  labels.sort();
  const seqAsync = analyze(members);
  const hint = seqAsync.isSequentialAsync ? " (awaited sequentially)" : "";
  sentences.push(`Concurrently: ${labels.join(", ")}${hint}.`);
}

/**
 * Renders a trace as flowing English prose — one sentence per call ("The order service places the
 * order for …, returning …"), with concurrent segments collapsed into a "Concurrently: …" sentence.
 *
 * INTENT: reach for this when a trace is meant to be read as narrative (reports, LLM prompts) rather
 * than scanned as a tree. Class/method names are de-camel-cased; errors read as "failed to <verb>".
 *
 * @returns the sentences joined by single spaces; an empty tree yields an empty string.
 */
export function renderProse(tree: TraceTree): string {
  const sentences: string[] = [];
  renderTree(tree.roots, sentences);
  return sentences.join(" ");
}
