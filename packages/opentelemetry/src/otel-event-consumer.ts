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
import {
  type Context,
  context,
  SpanStatusCode,
  TraceFlags,
  type Tracer,
  trace,
} from "@opentelemetry/api";
import { startWithIds } from "./narrative-trace-id-generator.js";
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

/** What the consumer remembers: live frames, and the contexts of frames that already ended. */
interface ParentMemory {
  readonly active: PerishableMap<SpanId, SpanFrame>;
  readonly finished: PerishableMap<SpanId, Context>;
  /**
   * Learned from the first span started: `true` when the SDK mirrors NarrativeTrace span ids (the
   * OTel span id equals the NarrativeTrace one), `null` until then. When mirrored, a reconstructed
   * parent is exact, so finished frames are not remembered and no parent is marked synthetic.
   */
  mirrored: boolean | null;
}

interface ResolvedParent {
  readonly context: Context;
  /** True when the parent was rebuilt from the NarrativeTrace parent id, not found in memory. */
  readonly synthetic: boolean;
}

/**
 * The OTel context to parent under. A root
 * (`parentSpanId === null`) keeps whatever is active. Any other span parents, in order, on the live
 * frame of its parent; on the remembered context of the parent if it has already ended or was
 * adopted; else the id is known to nobody here and the enter event's `concurrency` tells the two
 * cases apart: absent, the parent id came from an adopted header (`run(fn, traceparent)`, the
 * NestJS interceptor), so it is rebuilt as a REMOTE parent from the event's trace id, parent id and
 * flags, remembered, and not marked; present, the span was opened by a local hand-off (a snapshot's
 * first span, a fork or fire-and-forget member, each tagged at its first enter), so it is rebuilt
 * as a LOCAL parent and marked on the child as synthetic. It never falls back to `context.active()`
 * for a non-null parent: the active span is whatever happens to be running, and parenting a late
 * child there is silently wrong.
 *
 * @edgeCase A child can start after its local parent ended. Ended frames are remembered in a second
 * bounded map (same capacity and TTL as the active one), so such a child parents on its real OTel
 * parent; the TTL is the documented limit, past it the local parent is rebuilt and marked
 * `narrative.parent.synthetic=true` with `narrative.parent_span_id`.
 *
 * @edgeCase When the SDK mirrors NarrativeTrace ids ({@link NarrativeTraceIdGenerator}, detected
 * from the first span started: its OTel span id equals the NarrativeTrace one) the rebuilt local
 * parent is exactly the real OTel parent, so finished frames are not remembered and nothing is
 * marked.
 */
function resolveParent(memory: ParentMemory, event: EnterEvent): ResolvedParent {
  const sc = event.spanContext;
  if (sc.parentSpanId === null) return { context: context.active(), synthetic: false };
  const live = memory.active.get(sc.parentSpanId);
  if (live) return { context: live.otelContext, synthetic: false };
  const ended = memory.finished.get(sc.parentSpanId);
  if (ended) return { context: ended, synthetic: false };
  if (event.concurrency === undefined) {
    const remote = parentContext(sc, sc.parentSpanId, true);
    memory.finished.put(sc.parentSpanId, remote);
    return { context: remote, synthetic: false };
  }
  return { context: parentContext(sc, sc.parentSpanId, false), synthetic: true };
}

function parentContext(sc: EnterEvent["spanContext"], parentSpanId: SpanId, isRemote: boolean) {
  return trace.setSpanContext(context.active(), {
    traceId: sc.traceId,
    spanId: parentSpanId,
    traceFlags: sc.traceFlags ?? TraceFlags.SAMPLED,
    isRemote,
  });
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

function markSynthetic(span: ReturnType<Tracer["startSpan"]>, parentSpanId: string): void {
  span.setAttribute("narrative.parent.synthetic", true);
  span.setAttribute("narrative.parent_span_id", parentSpanId);
}

function startLive(tracer: Tracer, event: EnterEvent, parentCtx: Context) {
  const sc = event.spanContext;
  const ids = { spanId: sc.spanId, traceId: sc.parentSpanId === null ? sc.traceId : null };
  const name = `${event.signature.className}.${event.signature.methodName}`;
  return startWithIds(ids, "live", () =>
    tracer.startSpan(name, { startTime: event.timestamp }, parentCtx),
  );
}

function handleEnter(tracer: Tracer, memory: ParentMemory, event: EnterEvent): void {
  const parent = resolveParent(memory, event);
  const parentCtx = parent.context;
  const sc = event.spanContext;
  const span = startLive(tracer, event, parentCtx);
  memory.mirrored ??= span.spanContext().spanId === sc.spanId;
  if (parent.synthetic && !memory.mirrored) markSynthetic(span, sc.parentSpanId as string);
  applyEnterAttributes(event, span);
  memory.active.put(event.spanContext.spanId, {
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
  // TS divergence: a clean return sets explicit OK (status is otherwise left UNSET).
  if (event.outcome.kind === "returned") span.setStatus({ code: SpanStatusCode.OK });
}

/**
 * Emits a timestamped completion event on the parent span so a parent
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

function handleExit(tracer: Tracer, memory: ParentMemory, event: ExitEvent): void {
  const spans = memory.active;
  const frame = spans.remove(event.spanContext.spanId);
  if (!frame) {
    endOrphan(tracer, event.spanContext.spanId);
    return;
  }
  applyOutcome(frame.span, event);
  // Anchor the span's end to the exit event time so span duration equals the recorded call time.
  frame.span.end(event.timestamp);
  if (!memory.mirrored) memory.finished.put(event.spanContext.spanId, frame.otelContext);
  emitEventOnParent(spans, event, frame.signature);
}

function evictOrphan(frame: SpanFrame): void {
  frame.span.setStatus({ code: SpanStatusCode.ERROR, message: "orphaned — exit event lost" });
  frame.span.end();
}

export function createOtelEventConsumer(options: OtelEventConsumerOptions): EventConsumer {
  const capacity = options.maxActiveSpans ?? 1024;
  const ttlMs = options.spanTtlMs ?? 3_600_000;
  const memory: ParentMemory = {
    active: new PerishableMap<SpanId, SpanFrame>(capacity, ttlMs, evictOrphan, options.clock),
    finished: new PerishableMap<SpanId, Context>(capacity, ttlMs, () => {}, options.clock),
    mirrored: null,
  };
  return (event: TraceEvent) => {
    switch (event.type) {
      case "enter":
        return handleEnter(options.tracer, memory, event);
      case "exit":
        return handleExit(options.tracer, memory, event);
    }
  };
}
