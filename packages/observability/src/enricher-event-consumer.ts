// SPDX-License-Identifier: BUSL-1.1
// Licensed under the Business Source License 1.1 (see LICENSE); Change Date: four years from publication; Change License: Apache-2.0
// Copyright (c) 2026 Empower Agile
import {
  ContextExport,
  type EnterEvent,
  type EventConsumer,
  type ExitEvent,
  humanName,
  type SpanId,
  type TraceEvent,
  type TraceId,
} from "@narrativetrace/core";
import { LogContext } from "./log-context.js";

interface Frame {
  readonly className: string;
  readonly methodName: string;
  readonly parentSpanId: SpanId | null;
  readonly depth: number;
}

function setIdentityOnce(key: string, value: string | undefined): void {
  if (value !== undefined && LogContext.get(key) === undefined) {
    LogContext.set(key, value);
  }
}

function resolveDepth(frames: Map<SpanId, Frame>, parentSpanId: SpanId | null): number {
  if (parentSpanId === null) return 0;
  const parent = frames.get(parentSpanId);
  return parent ? parent.depth + 1 : 0;
}

/**
 * Trace-level fields the first (root) span owns: later spans share the trace, so re-setting them
 * would let a child overwrite the trace's identity.
 */
function setTraceIdentityOnce(sc: EnterEvent["spanContext"]): void {
  if (LogContext.get("trace_id") === undefined) {
    LogContext.set("trace_id", sc.traceId);
    LogContext.set("nt.traceName", humanName(sc.traceId as TraceId));
  }
  setIdentityOnce("service.name", sc.serviceName);
  setIdentityOnce("service.version", sc.serviceVersion);
  setIdentityOnce("service.environment", sc.environment);
}

// className/methodName come straight from MethodSignature, a public API that accepts any string —
// control-escaped once here (before entering the frame map) so a hostile one cannot forge a log
// line either now or when a child's exit later restores this frame (cross-port shape F6,
// 2026-09-02 audit).
function handleEnter(frames: Map<SpanId, Frame>, event: EnterEvent): void {
  const className = ContextExport.sanitize(event.signature.className);
  const methodName = ContextExport.sanitize(event.signature.methodName);
  const { spanId, parentSpanId } = event.spanContext;
  const depth = resolveDepth(frames, parentSpanId);
  frames.set(spanId, { className, methodName, parentSpanId, depth });
  LogContext.set("code.namespace", className);
  LogContext.set("code.function", methodName);
  LogContext.set("nt.depth", depth);
  setTraceIdentityOnce(event.spanContext);
  LogContext.set("span_id", spanId);
  LogContext.set("nt.entryType", "entry");
  LogContext.set("nt.eventType", "method_enter");
  LogContext.set("nt.schemaVersion", "1.0");
}

function handleExit(frames: Map<SpanId, Frame>, event: ExitEvent): void {
  const frame = frames.get(event.spanContext.spanId);
  if (!frame) return;
  frames.delete(event.spanContext.spanId);
  const parentFrame = frame.parentSpanId !== null ? frames.get(frame.parentSpanId) : undefined;
  if (parentFrame) {
    LogContext.set("code.namespace", parentFrame.className);
    LogContext.set("code.function", parentFrame.methodName);
  }
  // Root-level exit depth is 0 (Java max(0, depth-1)), not a -1 sentinel.
  LogContext.set("nt.depth", parentFrame ? parentFrame.depth : 0);
  LogContext.set("nt.eventType", "method_exit");
}

export function createEnricherEventConsumer(): EventConsumer {
  const frames = new Map<SpanId, Frame>();
  return (event: TraceEvent) => {
    switch (event.type) {
      case "enter":
        return handleEnter(frames, event);
      case "exit":
        return handleExit(frames, event);
    }
  };
}
