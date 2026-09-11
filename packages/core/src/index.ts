// SPDX-License-Identifier: BUSL-1.1
// Licensed under the Business Source License 1.1 (see LICENSE); Change Date: four years from publication; Change License: Apache-2.0
// Copyright (c) 2026 Empower Agile
export {
  type AttributeTier,
  SPAN_CONTEXT_FIELDS,
  spanContextFieldTier,
} from "./attribute-tier.js";
export type { ClientIp, EnduserId, HttpRoute, SessionId, TenantId } from "./branded-types.js";
export {
  BufferedEventConsumer,
  type DrainMode,
  type TraceSubscriber,
} from "./buffered-event-consumer.js";
export {
  type CanonicalEntry,
  type EntryOutcome,
  SCHEMA_VERSION,
  toCanonicalEntry,
} from "./canonical-entry.js";
export { canonicalEntries, exportCanonicalJson } from "./canonical-trace-export.js";
export {
  type ConcurrencyInfo,
  type ConcurrencyKind,
  concurrencyInfo,
} from "./concurrency-info.js";
export { NarrativeTraceConfig } from "./config.js";
/** @internal — use AsyncNarrativeContext for server code. SyncNarrativeContext is only needed for browser environments without AsyncLocalStorage. */
export { LiveChildRegistration, SyncNarrativeContext } from "./context.js";
export { ContextExport } from "./context-export.js";
export type { ContextScope, ContextSnapshot } from "./context-snapshot.js";
export { ControlEscape } from "./control-escape.js";
export { DualPathPipeline, ensureStoreBacked } from "./dual-path-pipeline.js";
export { errorMessage, errorTypeName } from "./error-display.js";
export type { EventConsumer, EventPipeline } from "./event-pipeline.js";
export { EventStoreConsumer } from "./event-store-consumer.js";
export { buildFailureReport } from "./failure-report.js";
export { FireAndForgetGroup } from "./fire-and-forget-group.js";
export { ForkJoinGroup, type ForkJoinGroupOptions } from "./fork-join-group.js";
export {
  type IdGenerator,
  registerIdGenerator,
  webCryptoIdGenerator,
} from "./id-generator.js";
export { renderIndentedText } from "./indented-text-renderer.js";
export { isThenable } from "./is-thenable.js";
export { exportChapter, exportJson, type TraceMetadata } from "./json-export.js";
export { MarkdownEscape } from "./markdown-escape.js";
export {
  type MarkdownDocumentMetadata,
  type MarkdownOptions,
  renderMarkdown,
  renderMarkdownBody,
  renderMarkdownDocument,
} from "./markdown-renderer.js";
export {
  type MethodSignature,
  type MethodSignatureOptions,
  methodSignature,
} from "./method-signature.js";
export type { NarrativeContext } from "./narrative-context.js";
export { NOOP_CONTEXT } from "./noop-context.js";
export { type ParameterCapture, parameterCapture } from "./parameter-capture.js";
export { PerishableMap } from "./perishable-map.js";
export { renderProse } from "./prose-renderer.js";
export { getRedactedParams, registerRedactedParams } from "./redacted-params-registry.js";
export { RedactionPolicy } from "./redaction-policy.js";
export {
  type RenderedFields,
  type RenderedValue,
  renderStructured,
  type StructuredOptions,
} from "./rendered-value.js";
export { frameScenario } from "./scenario-framer.js";
export {
  type ScenarioResult,
  scenarioDisplayName,
  scenarioResult,
} from "./scenario-result.js";
export type { ServiceIdentity } from "./service-identity.js";
export { type SpanContext, type SpanContextExtras, spanContext } from "./span-context.js";
export {
  generateSpanId,
  generateTraceId,
  isValidSpanId,
  isValidTraceId,
  type SpanId,
  type TraceId,
} from "./span-id-generator.js";
export { findUnresolved, resolveTemplate } from "./template-parser.js";
export {
  collectTemplateWarnings,
  formatTemplateWarnings,
  type TemplateWarning,
} from "./template-warning-collector.js";
export type {
  EnterEvent,
  ExitEvent,
  ForkCreatedEvent,
  JoinCompleteEvent,
  TraceEvent,
} from "./trace-event.js";
export { anyTraceLoss, NO_TRACE_LOSS, type TraceLoss, traceLoss } from "./trace-loss.js";
export { humanName } from "./trace-namer.js";
export { hasAnyError, type TraceNode, traceNode } from "./trace-node.js";
export {
  type Incomplete,
  incomplete,
  type Returned,
  returned,
  type Threw,
  type TraceOutcome,
  threw,
} from "./trace-outcome.js";
export { type TraceTree, traceTree } from "./trace-tree.js";
export { formatTraceparent, parseTraceparent } from "./traceparent.js";
export { isActiveLevel, isEnabled, parseTracingLevel, type TracingLevel } from "./tracing-level.js";
export { TREE_WALK_MARKER, TreeWalk, type TreeWalkStop, walkPreOrder } from "./tree-walk.js";
export { type RenderOptions, renderCapture, renderValue } from "./value-renderer.js";
