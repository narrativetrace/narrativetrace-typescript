// SPDX-License-Identifier: BUSL-1.1
// Licensed under the Business Source License 1.1 (see LICENSE); Change Date: four years from publication; Change License: Apache-2.0
// Copyright (c) 2026 Empower Agile
import {
  type ConcurrencyInfo,
  ContextExport,
  errorMessage,
  humanName,
  type MethodSignature,
  type ParameterCapture,
  type RenderedValue,
  type SpanContext,
  type TraceId,
  type TraceNode,
  type TraceOutcome,
} from "@narrativetrace/core";
import {
  type Attributes,
  type AttributeValue,
  type Span,
  SpanStatusCode,
} from "@opentelemetry/api";

const MAX_FLATTEN_DEPTH = 3;

/**
 * Span-level attributes (class, method, typed params) applied to every span.
 *
 * @remarks className/methodName come straight from a {@link MethodSignature}, a public API that
 * accepts any string — control-escaped here so a hostile one cannot forge a telemetry field
 * (cross-runtime shape F6, 2026-09-02 audit).
 */
export function setSpanAttributes(sig: MethodSignature, span: Span): void {
  span.setAttribute("code.namespace", ContextExport.sanitize(sig.className));
  span.setAttribute("code.function", ContextExport.sanitize(sig.methodName));
  for (const param of sig.parameters) {
    applyParamAttribute((key, value) => span.setAttribute(key, value), param);
  }
}

/**
 * Trace-identity attributes ({@code nt.trace_id}, {@code nt.traceName}) applied to EVERY span so any
 * span — root, child, or orphan — can be correlated back to its narrative (TS-OTEL-9/10).
 */
export function setTraceIdentityAttributes(sc: SpanContext, span: Span): void {
  span.setAttribute("nt.trace_id", sc.traceId);
  span.setAttribute("nt.traceName", humanName(sc.traceId as TraceId));
}

/** Canonical {@code nt.*} schema attributes applied to every span. */
export function setNtSchemaAttributes(sc: SpanContext, span: Span): void {
  span.setAttribute("nt.entryType", "entry");
  span.setAttribute("nt.schemaVersion", "1.0");
  if (sc.storyId !== undefined) span.setAttribute("nt.storyId", sc.storyId);
  if (sc.chapterId !== undefined) span.setAttribute("nt.chapterId", sc.chapterId);
}

/**
 * Trace-level identity (service/http/user) applied to the ROOT span only.
 *
 * @remarks The http/user fields are request-derived — control-escaped and length-capped via
 * {@link ContextExport.sanitize} so a value set programmatically (bypassing every HTTP filter, the
 * export boundary's own reason to normalize again) cannot forge a telemetry field (cross-runtime shape
 * F6, 2026-09-02 audit).
 */
export function setTraceLevelAttributes(sc: SpanContext, span: Span): void {
  for (const [attr, extract] of TRACE_LEVEL_FIELDS) {
    const value = extract(sc);
    if (value !== undefined) span.setAttribute(attr, sanitizedAttribute(value));
  }
}

function sanitizedAttribute(value: string | number): string | number {
  return typeof value === "string" ? ContextExport.sanitize(value) : value;
}

/** Applies the outcome attribute/status to a span (returned value, in-flight, or recorded error). */
export function setOutcomeAttributes(outcome: TraceOutcome, span: Span): void {
  if (outcome.kind === "returned") {
    if (outcome.renderedValue !== null)
      span.setAttribute("narrative.outcome", outcome.renderedValue);
  } else if (outcome.kind === "threw") {
    const err = outcome.error;
    span.recordException(err instanceof Error ? err : String(err));
    span.setStatus({
      code: SpanStatusCode.ERROR,
      message: err instanceof Error ? err.message : String(err),
    });
  } else {
    span.setAttribute("narrative.outcome", "in-flight");
  }
}

/** Concurrency attributes from fork-join / fire-and-forget membership (TS subset — no thread ids). */
export function setConcurrencyAttributes(info: ConcurrencyInfo | undefined, span: Span): void {
  if (info === undefined) return;
  span.setAttribute("narrative.concurrency.groupId", info.groupId);
  span.setAttribute("narrative.concurrency.kind", info.kind);
  span.setAttribute("narrative.concurrency.taskLabel", info.taskLabel);
}

/** Emits a child-completion event on the parent span, anchored to the child's end time. */
export function emitChildEvent(parentSpan: Span, child: TraceNode): void {
  const className = ContextExport.sanitize(child.signature.className);
  const methodName = ContextExport.sanitize(child.signature.methodName);
  const attrs = buildEventAttributes(child.signature, child.outcome);
  parentSpan.addEvent(`${className}.${methodName}`, attrs, child.startTimeMs + child.durationMs);
}

/** Event attributes for a child-completion event on the parent span (typed params + outcome). */
export function buildEventAttributes(sig: MethodSignature, outcome: TraceOutcome): Attributes {
  const attrs: Record<string, AttributeValue> = {};
  for (const param of sig.parameters) {
    applyParamAttribute((key, value) => {
      attrs[key] = value;
    }, param);
  }
  if (outcome.kind === "returned" && outcome.renderedValue !== null) {
    attrs["narrative.outcome"] = outcome.renderedValue;
  } else if (outcome.kind === "threw") {
    attrs["narrative.outcome"] = `error: ${errorMessage(outcome.error)}`;
  }
  return attrs;
}

type SetAttr = (key: string, value: AttributeValue) => void;

function applyParamAttribute(set: SetAttr, param: ParameterCapture): void {
  if (param.redacted || param.renderedValue.length === 0) return;
  const prefix = `narrative.param.${param.name}`;
  if (param.structured !== undefined) {
    flattenStructured(set, prefix, param.structured, 0);
  } else {
    setTypedFromString(set, prefix, param.renderedValue);
  }
}

/** The directly-settable attribute for a leaf kind; `undefined` for the composite kinds. */
function leafAttribute(value: RenderedValue): string | number | boolean | undefined {
  switch (value.kind) {
    case "string":
    case "number":
    case "boolean":
      return value.value;
    case "other":
      return value.text;
    default:
      return undefined;
  }
}

function flattenStructured(
  set: SetAttr,
  prefix: string,
  value: RenderedValue,
  depth: number,
): void {
  const leaf = leafAttribute(value);
  if (leaf !== undefined) {
    set(prefix, leaf);
  } else if (value.kind === "list") {
    setHomogeneousList(set, prefix, value.items);
  } else if (value.kind === "object" && depth < MAX_FLATTEN_DEPTH) {
    for (const [key, field] of Object.entries(value.fields)) {
      flattenStructured(set, `${prefix}.${key}`, field, depth + 1);
    }
  }
}

function setHomogeneousList(set: SetAttr, prefix: string, items: readonly RenderedValue[]): void {
  if (items.length === 0) return;
  const kind = items[0]?.kind;
  if (!items.every((i) => i.kind === kind)) return;
  if (kind === "string")
    set(
      prefix,
      items.map((i) => (i as { value: string }).value),
    );
  else if (kind === "number")
    set(
      prefix,
      items.map((i) => (i as { value: number }).value),
    );
  else if (kind === "boolean")
    set(
      prefix,
      items.map((i) => (i as { value: boolean }).value),
    );
}

/**
 * Type-inference fallback when no structured value is available (manual construction, fixtures):
 * `true`/`false` → boolean, integers/decimals → number, `"quoted"` → the unquoted string, else the
 * raw string. Mirrors Java's `setTypedFromString`.
 */
function setTypedFromString(set: SetAttr, prefix: string, rendered: string): void {
  if (rendered === "true" || rendered === "false") {
    set(prefix, rendered === "true");
  } else if (/^-?\d+$/.test(rendered)) {
    set(prefix, Number(rendered));
  } else if (rendered.trim() !== "" && Number.isFinite(Number(rendered))) {
    set(prefix, Number(rendered));
  } else if (rendered.length >= 2 && rendered.startsWith('"') && rendered.endsWith('"')) {
    set(prefix, rendered.slice(1, -1));
  } else {
    set(prefix, rendered);
  }
}

const TRACE_LEVEL_FIELDS: readonly [string, (sc: SpanContext) => string | number | undefined][] = [
  ["nt.service.name", (sc) => sc.serviceName],
  ["nt.service.version", (sc) => sc.serviceVersion],
  ["nt.environment", (sc) => sc.environment],
  ["nt.http.method", (sc) => sc.httpMethod],
  ["nt.http.route", (sc) => sc.httpRoute],
  ["nt.client.ip", (sc) => sc.clientIp],
  ["nt.enduser.id", (sc) => sc.enduserId],
  ["nt.session.id", (sc) => sc.sessionId],
  ["nt.tenant.id", (sc) => sc.tenantId],
];
