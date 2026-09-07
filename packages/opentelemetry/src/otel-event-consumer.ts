// SPDX-License-Identifier: BUSL-1.1
// Licensed under the Business Source License 1.1 (see LICENSE); Change Date: four years from publication; Change License: Apache-2.0
// Copyright (c) 2026 Empower Agile
import type {
  EnterEvent,
  EventConsumer,
  ExitEvent,
  MethodSignature,
  SpanId,
  TraceEvent,
} from "@narrativetrace/core";
import { PerishableMap } from "@narrativetrace/core";
import { type Context, context, SpanStatusCode, type Tracer, trace } from "@opentelemetry/api";
import {
  buildEventAttributes,
  setNtSchemaAttributes,
  setOutcomeAttributes,
  setSpanAttributes,
  setTraceIdentityAttributes,
  setTraceLevelAttributes,
} from "./span-context-attribute-mapper.js";

export interface OtelEventConsumerOptions {
  tracer: Tracer;
  maxActiveSpans?: number;
  spanTtlMs?: number;
  clock?: () => number;
}

interface SpanFrame {
  readonly span: import("@opentelemetry/api").Span;
  readonly otelContext: Context;
  readonly signature: MethodSignature;
}

/** The OTel context to parent under: the recorded parent span's, else whatever is active. */
function resolveParentContext(
  spans: PerishableMap<SpanId, SpanFrame>,
  parentSpanId: SpanId | null,
): Context {
  if (parentSpanId === null) return context.active();
  return spans.get(parentSpanId)?.otelContext ?? context.active();
}

function applyEnterAttributes(event: EnterEvent, span: ReturnType<Tracer["startSpan"]>): void {
  setSpanAttributes(event.signature, span);
  setTraceIdentityAttributes(event.spanContext, span);
  setNtSchemaAttributes(event.spanContext, span);
  // Trace-tier attributes are per-trace, so only the root span carries them.
  if (event.spanContext.parentSpanId === null) {
    setTraceLevelAttributes(event.spanContext, span);
  }
}

function handleEnter(
  tracer: Tracer,
  spans: PerishableMap<SpanId, SpanFrame>,
  event: EnterEvent,
): void {
  const parentCtx = resolveParentContext(spans, event.spanContext.parentSpanId);
  const span = tracer.startSpan(
    `${event.signature.className}.${event.signature.methodName}`,
    { startTime: event.timestamp },
    parentCtx,
  );
  applyEnterAttributes(event, span);
  spans.put(event.spanContext.spanId, {
    span,
    otelContext: trace.setSpan(parentCtx, span),
    signature: event.signature,
  });
}

function endOrphan(tracer: Tracer, spanId: SpanId): void {
  const orphan = tracer.startSpan(`orphan.${spanId}`);
  orphan.setStatus({ code: SpanStatusCode.ERROR, message: "orphaned — enter event lost" });
  orphan.end();
}

function applyOutcome(span: import("@opentelemetry/api").Span, event: ExitEvent): void {
  setOutcomeAttributes(event.outcome, span);
  // TS divergence: a clean return sets explicit OK (Java leaves status UNSET).
  if (event.outcome.kind === "returned") span.setStatus({ code: SpanStatusCode.OK });
}

/**
 * Emits a timestamped completion event on the parent span (Java `emitEventOnParent`) so a parent
 * span records one `Class.method` event per child that finished under it, carrying the child's
 * typed param + outcome attributes.
 */
function emitEventOnParent(
  spans: PerishableMap<SpanId, SpanFrame>,
  event: ExitEvent,
  signature: MethodSignature,
): void {
  const parentSpanId = event.spanContext.parentSpanId;
  if (parentSpanId === null) return;
  const parent = spans.get(parentSpanId);
  if (!parent) return;
  const name = `${signature.className}.${signature.methodName}`;
  parent.span.addEvent(name, buildEventAttributes(signature, event.outcome), event.timestamp);
}

function handleExit(
  tracer: Tracer,
  spans: PerishableMap<SpanId, SpanFrame>,
  event: ExitEvent,
): void {
  const frame = spans.remove(event.spanContext.spanId);
  if (!frame) {
    endOrphan(tracer, event.spanContext.spanId);
    return;
  }
  applyOutcome(frame.span, event);
  // Anchor the span's end to the exit event time so span duration equals the recorded call time.
  frame.span.end(event.timestamp);
  emitEventOnParent(spans, event, frame.signature);
}

function evictOrphan(frame: SpanFrame): void {
  frame.span.setStatus({ code: SpanStatusCode.ERROR, message: "orphaned — exit event lost" });
  frame.span.end();
}

export function createOtelEventConsumer(options: OtelEventConsumerOptions): EventConsumer {
  const spans = new PerishableMap<SpanId, SpanFrame>(
    options.maxActiveSpans ?? 1024,
    options.spanTtlMs ?? 3_600_000,
    evictOrphan,
    options.clock,
  );
  return (event: TraceEvent) => {
    switch (event.type) {
      case "enter":
        return handleEnter(options.tracer, spans, event);
      case "exit":
        return handleExit(options.tracer, spans, event);
    }
  };
}
