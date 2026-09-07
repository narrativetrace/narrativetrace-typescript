// SPDX-License-Identifier: BUSL-1.1
// Licensed under the Business Source License 1.1 (see LICENSE); Change Date: four years from publication; Change License: Apache-2.0
// Copyright (c) 2026 Empower Agile
import {
  type CanonicalEntry,
  type EntryOutcome,
  SCHEMA_VERSION,
  serviceNameOrUnknown,
} from "./canonical-entry.js";
import type { SpanContext } from "./span-context.js";
import type { TraceId } from "./span-id-generator.js";
import { resolveTraceIdentity, type TraceIdentity } from "./trace-identity.js";
import { humanName } from "./trace-namer.js";
import type { TraceNode } from "./trace-node.js";
import type { TraceOutcome } from "./trace-outcome.js";
import type { TraceTree } from "./trace-tree.js";
import { TreeWalk, type TreeWalkStop } from "./tree-walk.js";

/** Sequential synthetic span id, formatted as the 16 lowercase hex digits the schema requires. */
function syntheticSpanId(sequence: number): string {
  return sequence.toString(16).padStart(16, "0");
}

function spanIdOf(node: TraceNode, next: () => number): string {
  return node.spanContext ? node.spanContext.spanId : syntheticSpanId(next());
}

function outcomeName(outcome: TraceOutcome): EntryOutcome {
  if (outcome.kind === "returned") return "success";
  if (outcome.kind === "threw") return "failure";
  return "incomplete";
}

function errorMessageOf(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function errorTypeOf(error: unknown): string {
  return error instanceof Error ? error.constructor.name : typeof error;
}

/** One node's place in the flattening: the node, the ids it was assigned, and the tree's identity. */
interface EntryScope {
  readonly node: TraceNode;
  readonly spanId: string;
  readonly parentSpanId: string | null;
  readonly id: TraceIdentity;
}

/**
 * Identity and correlation fields shared by the enter and exit entries of one node.
 *
 * @remarks Trace-scoped fields come off the node's OWN context when it has one and off the tree's
 * resolved identity otherwise — never regenerated per node, or a context-free child would split its
 * own trace's identity. `nt.traceName` is derived from the id the entry actually carries, so the
 * two can never disagree.
 */
function commonFields({ node, spanId, parentSpanId, id }: EntryScope) {
  const sc = node.spanContext;
  const effective = sc ?? id.inherited;
  const traceId = (sc?.traceId ?? id.traceId) as TraceId;
  return {
    trace_id: traceId,
    span_id: spanId,
    parent_span_id: parentSpanId,
    "code.namespace": node.signature.className,
    "code.function": node.signature.methodName,
    "nt.entryType": "entry" as const,
    "nt.schemaVersion": SCHEMA_VERSION,
    "nt.traceName": humanName(traceId),
    ...narrativeIdentity(sc, id, effective),
    service: serviceNameOrUnknown(effective?.serviceName),
  };
}

/** Story/chapter always resolve; only `environment` can genuinely be absent. */
function narrativeIdentity(
  sc: SpanContext | undefined,
  id: TraceIdentity,
  effective: SpanContext | undefined,
) {
  return {
    "nt.storyId": sc?.storyId ?? id.storyId,
    "nt.chapterId": sc?.chapterId ?? id.chapterId,
    ...(effective?.environment !== undefined && { environment: effective.environment }),
  };
}

function enterEntry(scope: EntryScope): CanonicalEntry {
  const { node } = scope;
  const { className, methodName, parameters } = node.signature;
  return {
    ...commonFields(scope),
    timestamp: new Date(node.startTimeMs).toISOString(),
    level: "trace",
    message: `→ ${className}.${methodName}`,
    "nt.eventType": "method_enter",
    ...(parameters.length > 0 && {
      "nt.parameters": parameters.map((p) => ({ name: p.name, value: p.renderedValue })),
    }),
  };
}

type ExitFields = Partial<CanonicalEntry> & { level: string; message: string };

function threwFields(error: unknown): ExitFields {
  const message = errorMessageOf(error);
  return {
    level: "error",
    message: `!! Error: ${message}`,
    "exception.type": errorTypeOf(error),
    "exception.message": message,
  };
}

/** A void completion contributes no return value — the key is absent, not null. */
function returnedFields(renderedValue: string | null): ExitFields {
  if (renderedValue === null) return { level: "trace", message: "← returned" };
  return {
    level: "trace",
    message: `← returned: ${renderedValue}`,
    "nt.returnValue": renderedValue,
  };
}

/** Outcome-shaped fields of an exit entry. */
function exitOutcomeFields(outcome: TraceOutcome): ExitFields {
  if (outcome.kind === "threw") return threwFields(outcome.error);
  if (outcome.kind === "incomplete") return { level: "trace", message: "← incomplete" };
  return returnedFields(outcome.renderedValue);
}

function exitEntry(scope: EntryScope): CanonicalEntry {
  const { node } = scope;
  return {
    ...commonFields(scope),
    timestamp: new Date(node.startTimeMs + node.durationMs).toISOString(),
    "nt.eventType": "method_exit",
    "nt.outcome": outcomeName(node.outcome),
    durationMs: node.durationMs,
    ...exitOutcomeFields(node.outcome),
  };
}

/** One node's place on the explicit append stack: its entry scope and how far into its children we've gotten. */
interface AppendFrame {
  readonly scope: EntryScope;
  stop: TreeWalkStop | undefined;
  children: readonly TraceNode[] | undefined;
  index: number;
}

function pushAppendFrame(
  entries: CanonicalEntry[],
  node: TraceNode,
  parentSpanId: string | null,
  next: () => number,
  id: TraceIdentity,
): AppendFrame {
  const scope: EntryScope = { node, spanId: spanIdOf(node, next), parentSpanId, id };
  entries.push(enterEntry(scope));
  return { scope, stop: undefined, children: undefined, index: 0 };
}

function enterAppendFrame(frame: AppendFrame, walk: TreeWalk<TraceNode>): void {
  frame.stop = walk.enter(frame.scope.node);
  frame.children = frame.stop === undefined ? frame.scope.node.children : [];
}

// Explicit-stack (non-recursive) pre-order flatten, bounded and cycle-safe via TreeWalk — mirrors
// json-export.ts's flattenNode; a node the walk stops at still gets its own enter/exit pair.
function appendNode(
  entries: CanonicalEntry[],
  root: TraceNode,
  parentSpanId: string | null,
  next: () => number,
  id: TraceIdentity,
): void {
  const walk = new TreeWalk<TraceNode>();
  const stack: AppendFrame[] = [pushAppendFrame(entries, root, parentSpanId, next, id)];
  while (stack.length > 0) {
    stepAppendFrame(stack, walk, entries, next, id);
  }
}

function descendAppendFrame(
  frame: AppendFrame,
  entries: CanonicalEntry[],
  next: () => number,
  id: TraceIdentity,
): AppendFrame {
  const child = (frame.children as readonly TraceNode[])[frame.index++] as TraceNode;
  return pushAppendFrame(entries, child, frame.scope.spanId, next, id);
}

function stepAppendFrame(
  stack: AppendFrame[],
  walk: TreeWalk<TraceNode>,
  entries: CanonicalEntry[],
  next: () => number,
  id: TraceIdentity,
): void {
  const frame = stack[stack.length - 1] as AppendFrame;
  if (frame.children === undefined) {
    enterAppendFrame(frame, walk);
    if (frame.stop === undefined) return;
  }
  if (frame.index < (frame.children as readonly TraceNode[]).length) {
    stack.push(descendAppendFrame(frame, entries, next, id));
    return;
  }
  if (frame.stop === undefined) walk.exit(frame.scope.node);
  entries.push(exitEntry(frame.scope));
  stack.pop();
}

/**
 * Flattens a captured trace into the canonical entry list `entry.schema.json` describes.
 *
 * INTENT: the per-test `.canonical.json` artifact, and the cross-runtime conformance fixture format.
 * It is derived from the finished tree rather than the live event stream, so a plain unit-test
 * capture with no span context still produces a complete, schema-valid document.
 *
 * @param tree the captured trace.
 * @returns one `method_enter` and one `method_exit` entry per node, depth-first with roots in
 * order, linked by span id. Nodes without a span context get sequential synthetic *span* ids, so
 * nesting survives the flattening either way; the *trace* id comes from
 * {@link resolveTraceIdentity} and is real and unique, so two independent captures are never
 * mistaken for one. Cross-run and cross-runtime byte comparison is the conformance normalizer's job:
 * it folds `trace_id` to a sequence before comparing goldens.
 * @remarks Unlike {@link toCanonicalEntry}, which maps a single event, exit entries here carry the
 * node's real `code.namespace`/`code.function`: the tree still knows its signature, whereas an
 * exit event only knows its span.
 * @example
 * ```ts
 * writeFileSync("trace.canonical.json", exportCanonicalJson(tree), "utf-8");
 * ```
 */
export function canonicalEntries(tree: TraceTree): CanonicalEntry[] {
  if (tree.isEmpty) return [];
  const entries: CanonicalEntry[] = [];
  const identity = resolveTraceIdentity(tree);
  let sequence = 0;
  const next = () => ++sequence;
  for (const root of tree.roots) appendNode(entries, root, null, next, identity);
  return entries;
}

/**
 * Serializes a captured trace as the `.canonical.json` artifact: a flat JSON array of entries.
 *
 * @param tree the captured trace.
 * @returns pretty-printed (2-space) JSON ending without a trailing newline, as every other
 * artifact this package writes does. An empty tree yields `[]`.
 */
export function exportCanonicalJson(tree: TraceTree): string {
  return JSON.stringify(canonicalEntries(tree), null, 2);
}
