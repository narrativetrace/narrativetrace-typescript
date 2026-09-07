// SPDX-License-Identifier: BUSL-1.1
// Licensed under the Business Source License 1.1 (see LICENSE); Change Date: four years from publication; Change License: Apache-2.0
// Copyright (c) 2026 Empower Agile
import { SCHEMA_VERSION, serviceNameOrUnknown } from "./canonical-entry.js";
import { displayParamValue } from "./parameter-capture.js";
import { type ScenarioResult, scenarioResult } from "./scenario-result.js";
import { resolveTraceIdentity, rootCallName, type TraceIdentity } from "./trace-identity.js";
import { hasAnyError, type TraceNode } from "./trace-node.js";
import type { TraceTree } from "./trace-tree.js";
import { TreeWalk, type TreeWalkStop, walkPreOrder } from "./tree-walk.js";

/**
 * Version of the chapter-tree envelope `{ version, trace?, scenario, events[] }`.
 *
 * @remarks Independent of {@link SCHEMA_VERSION}: `chapter-tree.schema.json` still pins this at
 * `1.0` while entries and chapters are at 1.2, because the envelope's shape has not changed. Two
 * fields, two release trains — conflating them is what made the entry version stick at 1.0.
 */
const CHAPTER_TREE_VERSION = "1.0";

/**
 * The outcome vocabulary of a chapter record, as `chapter.schema.json` enumerates it.
 *
 * @remarks A third spelling, and deliberately so: a chapter says `partial` where an entry says
 * `incomplete` and a scenario says `error` rather than `failure`. Java draws the same three
 * distinctions (`ChapterExporter`, `CanonicalEntryMapper`, `ScenarioResult`).
 */
type ChapterOutcome = "success" | "failure" | "partial";

/**
 * Scenario metadata attached to a JSON export. `scenario` names the run (required); the optional
 * fields (test class/method, framework, timestamp) are emitted only when present.
 *
 * @remarks `result` is not carried here — it is derived from whether any node threw.
 */
export type TraceMetadata = {
  readonly scenario: string;
  readonly testClass?: string;
  readonly testMethod?: string;
  readonly framework?: string;
  readonly timestamp?: string;
};

type JsonEvent = {
  spanId: string;
  type: "enter" | "exit";
  className: string;
  methodName: string;
  parentSpanId?: string;
  parameters?: { name: string; value: string }[];
  outcome?: "returned" | "threw" | "incomplete";
  returnValue?: string | null;
  errorType?: string;
  errorMessage?: string;
  errorContext?: string;
  durationMs?: number;
  truncated?: TreeWalkStop;
};

const OPTIONAL_SCENARIO_KEYS = ["testClass", "testMethod", "framework", "timestamp"] as const;

function optionalFields(metadata: TraceMetadata): Partial<TraceMetadata> {
  const fields: Record<string, string> = {};
  for (const key of OPTIONAL_SCENARIO_KEYS) {
    if (metadata[key] !== undefined) fields[key] = metadata[key];
  }
  return fields;
}

function buildScenario(metadata: TraceMetadata, hasError: boolean) {
  const result: ScenarioResult = scenarioResult(hasError);
  return {
    name: metadata.scenario,
    result,
    ...optionalFields(metadata),
  };
}

function flattenRoots(roots: readonly TraceNode[]): JsonEvent[] {
  const events: JsonEvent[] = [];
  let nextId = 1;
  for (const root of roots) {
    flattenNode(root, events, () => nextId++);
    nextId = events.length + 1;
  }
  return events;
}

/**
 * The `trace` block: always present, identity from the shared {@link resolveTraceIdentity} so this
 * document names the same trace as the chapter that embeds it and the canonical entries flattened
 * from the same tree.
 *
 * @remarks This used to resolve identity for itself, scanning **roots only** and omitting the whole
 * block when it found nothing. Both halves were divergences from the other two emitters: a mixed
 * tree whose context sits on a child resolved to "no trace" here while they inherited it, and a
 * span-less capture produced a chapter naming a trace with a tree inside it naming none.
 * `chapter-tree.schema.json` marks the block optional, so emitting it always is legal — the schema
 * is a floor, not the contract between the three emitters. The request-scoped fields are written
 * only when the tree actually carries an inherited span context: a generated identity knows which
 * trace this is and nothing about who called it, and inventing a service or a client IP would be
 * worse than omitting them.
 */
function buildTraceBlock(identity: TraceIdentity): Record<string, string> {
  const { inherited } = identity;
  const block: Record<string, string> = {
    traceId: identity.traceId,
    traceName: identity.traceName,
  };
  if (inherited?.serviceName !== undefined) block.serviceName = inherited.serviceName;
  if (inherited?.serviceVersion !== undefined) block.serviceVersion = inherited.serviceVersion;
  if (inherited?.environment !== undefined) block.environment = inherited.environment;
  if (inherited?.httpMethod !== undefined) block.httpMethod = inherited.httpMethod;
  if (inherited?.httpRoute !== undefined) block.httpRoute = inherited.httpRoute;
  if (inherited?.clientIp !== undefined) block.clientIp = inherited.clientIp;
  if (inherited?.enduserId !== undefined) block.enduserId = inherited.enduserId;
  if (inherited?.sessionId !== undefined) block.sessionId = inherited.sessionId;
  if (inherited?.tenantId !== undefined) block.tenantId = inherited.tenantId;
  return block;
}

function jsonDocument(tree: TraceTree, metadata: TraceMetadata, identity: TraceIdentity): string {
  const result = {
    version: CHAPTER_TREE_VERSION,
    trace: buildTraceBlock(identity),
    scenario: buildScenario(metadata, hasAnyError(tree.roots)),
    events: flattenRoots(tree.roots),
  };
  return JSON.stringify(result, null, 2);
}

/**
 * Serializes a trace to the versioned JSON envelope: `{ version, trace, scenario, events[] }`,
 * where the tree is flattened into paired `enter`/`exit` events in depth-first order.
 *
 * INTENT: the machine-readable export for tooling and ingestion pipelines; use the Markdown/prose
 * renderers for human consumption.
 *
 * @param metadata scenario naming and provenance; `scenario.result` is derived from node outcomes.
 * @returns pretty-printed (2-space) JSON. The `trace` block is always present — see
 * {@link resolveTraceIdentity} — and span IDs fall back to synthetic sequential ids when a node
 * lacks one.
 */
export function exportJson(tree: TraceTree, metadata: TraceMetadata): string {
  return jsonDocument(tree, metadata, resolveTraceIdentity(tree));
}

function countNodes(roots: readonly TraceNode[]): number {
  let count = 0;
  walkPreOrder(
    roots,
    (n) => n.children,
    () => {
      count++;
    },
  );
  return count;
}

function totalDuration(roots: readonly TraceNode[]): number {
  let total = 0;
  for (const root of roots) {
    total += root.durationMs;
  }
  return total;
}

/**
 * The chapter's identity fields.
 *
 * @remarks `service`, `nt.storyId` and `nt.chapterId` are all **required** by
 * `chapter.schema.json`, so each is written even for a trace captured with no span context at all
 * — omitting them produced a chapter that fails its own schema. All three come from
 * {@link resolveTraceIdentity}, the one resolution `.canonical.json` also reads, so one capture
 * never reports two different identities for itself; the *title* is a separate field and no longer
 * stands in for identity. The context consulted is the first found anywhere in the tree, not
 * `roots[0]`'s — a mixed tree keeps the service the captured child names.
 */
function chapterIdentityFields(identity: TraceIdentity): Record<string, string> {
  const { inherited } = identity;
  return {
    service: serviceNameOrUnknown(inherited?.serviceName),
    "nt.storyId": identity.storyId,
    "nt.chapterId": identity.chapterId,
    ...(inherited?.environment !== undefined && { environment: inherited.environment }),
  };
}

/**
 * How the chapter as a whole ended.
 *
 * @remarks `partial` exists because a chapter that never finished is not the same claim as one
 * that failed, and `chapter.schema.json` enumerates it — the old `error` was not a legal value at
 * all.
 *
 * **Pinned divergence from Java.** `ChapterExporter.outcomeOf` reads the *first root only*, so a
 * failure deeper in the tree reports `success`. This port keeps the deep reading it already had
 * ({@link hasAnyError}): a chapter containing a thrown call is not a clean success, and the level
 * field beside it has always said so. Only the vocabulary is being corrected here; changing which
 * nodes are consulted would be an unrelated behaviour change.
 */
function chapterOutcome(roots: readonly TraceNode[]): ChapterOutcome {
  if (hasAnyError(roots)) return "failure";
  return roots[0]?.outcome.kind === "incomplete" ? "partial" : "success";
}

/** The chapter's title: the root span's own story when it has one, else its `Class.method`. */
function chapterTitle(tree: TraceTree): string {
  return tree.roots[0]?.spanContext?.storyId ?? rootCallName(tree.roots);
}

/** Everything a chapter says about itself apart from its identity, in emission order. */
interface ChapterShape {
  readonly tree: TraceTree;
  readonly identity: TraceIdentity;
  readonly title: string;
  readonly outcome: ChapterOutcome;
  readonly hasError: boolean;
}

/**
 * The log-record half of a chapter: when it happened, how it read, and how loud it was.
 *
 * @remarks `trace_id` and `nt.traceName` are the resolved identity's, never `roots[0]`'s and never
 * the empty string: `chapter.schema.json` patterns both fields, so `""` produced a chapter that
 * failed its own schema whenever the capture had no span context.
 */
function chapterLogFields({ tree, identity, title, outcome, hasError }: ChapterShape) {
  return {
    timestamp: new Date().toISOString(),
    level: hasError ? "error" : "info",
    message: `Chapter complete: ${title} [${totalDuration(tree.roots)}ms] ${outcome}`,
    trace_id: identity.traceId,
    "nt.traceName": identity.traceName,
  };
}

function chapterCoreFields(shape: ChapterShape) {
  const { tree, title, outcome } = shape;
  return {
    ...chapterLogFields(shape),
    "nt.entryType": "chapter",
    "nt.schemaVersion": SCHEMA_VERSION,
    "nt.title": title,
    "nt.outcome": outcome,
    "nt.totalDurationMs": totalDuration(tree.roots),
    "nt.entryCount": countNodes(tree.roots),
    "nt.completionStatus": "complete",
  };
}

/**
 * Wraps a trace in a log-shaped "chapter" record — a flat, ingestion-friendly envelope with
 * `nt.*`-prefixed fields (title, outcome, total duration, entry count, trace id/name) and the full
 * {@link exportJson} payload embedded as `nt.chapterTree`.
 *
 * INTENT: emit one structured log line per completed trace for log-aggregation backends; the title
 * defaults to the root span's `storyId`, else `Class.method`.
 *
 * @returns pretty-printed (2-space) JSON. `level`/`nt.outcome` reflect whether any node threw.
 * Every identity field is populated for any tree, including one captured with no span context at
 * all — see {@link resolveTraceIdentity}. The embedded tree names the same trace: identity is
 * resolved once and threaded through rather than re-resolved by the embedded {@link exportJson}
 * call, so a tree with nothing to inherit and nothing assigned cannot generate two different ids
 * for the one capture.
 */
export function exportChapter(tree: TraceTree, metadata: TraceMetadata): string {
  const identity = resolveTraceIdentity(tree);
  const shape: ChapterShape = {
    tree,
    identity,
    title: chapterTitle(tree),
    outcome: chapterOutcome(tree.roots),
    hasError: hasAnyError(tree.roots),
  };
  return JSON.stringify(
    {
      ...chapterCoreFields(shape),
      "nt.chapterTree": jsonDocument(tree, metadata, identity),
      ...chapterIdentityFields(shape.identity),
    },
    null,
    2,
  );
}

function resolveSpanId(node: TraceNode, syntheticId: number): string {
  if (node.spanContext) return node.spanContext.spanId;
  return String(syntheticId);
}

function buildEnterEvent(node: TraceNode, spanId: string, parentSpanId: string | null): JsonEvent {
  return {
    spanId,
    type: "enter",
    className: node.signature.className,
    methodName: node.signature.methodName,
    parameters: node.signature.parameters.map((p) => ({
      name: p.name,
      value: displayParamValue(p),
      ...(p.redacted && { redacted: true }),
    })),
    ...(parentSpanId !== null && { parentSpanId }),
  };
}

/**
 * A void completion carries no value, so the key is absent rather than explicitly null — "this
 * method returned nothing" and "this method returned the value null" are different claims, and a
 * consumer that cannot tell them apart cannot render either honestly.
 */
function returnedEventFields(renderedValue: string | null): Partial<JsonEvent> {
  return { outcome: "returned", ...(renderedValue !== null && { returnValue: renderedValue }) };
}

function threwEventFields(error: unknown, errorContext: string | null): Partial<JsonEvent> {
  const context = errorContext ? { errorContext } : {};
  if (error instanceof Error) {
    return {
      outcome: "threw",
      errorType: error.constructor.name,
      errorMessage: error.message,
      ...context,
    };
  }
  return { outcome: "threw", errorMessage: String(error), ...context };
}

function outcomeFields(node: TraceNode): Partial<JsonEvent> {
  if (node.outcome.kind === "returned") return returnedEventFields(node.outcome.renderedValue);
  if (node.outcome.kind === "incomplete") return { outcome: "incomplete" };
  return threwEventFields(node.outcome.error, node.outcome.errorContext);
}

function concurrencyFields(node: TraceNode): Record<string, unknown> {
  if (!node.concurrency) return {};
  return {
    concurrency: {
      groupId: node.concurrency.groupId,
      kind: node.concurrency.kind,
      taskLabel: node.concurrency.taskLabel,
    },
  };
}

function buildExitEvent(node: TraceNode, spanId: string, truncated?: TreeWalkStop): JsonEvent {
  return {
    spanId,
    type: "exit",
    className: node.signature.className,
    methodName: node.signature.methodName,
    ...outcomeFields(node),
    ...(node.durationMs !== undefined && { durationMs: node.durationMs }),
    ...concurrencyFields(node),
    ...(truncated !== undefined && { truncated }),
  };
}

/** One node's place on the explicit flatten stack: its own span id and how far into its children we've gotten. */
interface FlattenFrame {
  readonly node: TraceNode;
  readonly spanId: string;
  stop: TreeWalkStop | undefined;
  children: readonly TraceNode[] | undefined;
  index: number;
}

function pushFlattenFrame(
  node: TraceNode,
  parentSpanId: string | null,
  nextId: () => number,
  events: JsonEvent[],
): FlattenFrame {
  const spanId = resolveSpanId(node, nextId());
  events.push(buildEnterEvent(node, spanId, parentSpanId));
  return { node, spanId, stop: undefined, children: undefined, index: 0 };
}

// Explicit-stack (non-recursive) pre-order flatten, bounded and cycle-safe via TreeWalk: a node
// the walk stops at still gets its own enter/exit pair (it "contributes itself"), with `truncated`
// on the exit event marking why its children were never flattened.
function flattenNode(root: TraceNode, events: JsonEvent[], nextId: () => number): void {
  const walk = new TreeWalk<TraceNode>();
  const stack: FlattenFrame[] = [pushFlattenFrame(root, null, nextId, events)];
  while (stack.length > 0) {
    stepFlattenFrame(stack, walk, nextId, events);
  }
}

// The first visit to `frame`: applies the guard and records its children (or none, if stopped).
function enterFlattenFrame(frame: FlattenFrame, walk: TreeWalk<TraceNode>): void {
  frame.stop = walk.enter(frame.node);
  frame.children = frame.stop === undefined ? frame.node.children : [];
}

function descendFlattenFrame(
  frame: FlattenFrame,
  nextId: () => number,
  events: JsonEvent[],
): FlattenFrame {
  const child = (frame.children as readonly TraceNode[])[frame.index++] as TraceNode;
  return pushFlattenFrame(child, frame.spanId, nextId, events);
}

function stepFlattenFrame(
  stack: FlattenFrame[],
  walk: TreeWalk<TraceNode>,
  nextId: () => number,
  events: JsonEvent[],
): void {
  const frame = stack[stack.length - 1] as FlattenFrame;
  if (frame.children === undefined) {
    enterFlattenFrame(frame, walk);
    if (frame.stop === undefined) return;
  }
  if (frame.index < (frame.children as readonly TraceNode[]).length) {
    stack.push(descendFlattenFrame(frame, nextId, events));
    return;
  }
  if (frame.stop === undefined) walk.exit(frame.node);
  events.push(buildExitEvent(frame.node, frame.spanId, frame.stop));
  stack.pop();
}
