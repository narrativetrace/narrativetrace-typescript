// SPDX-License-Identifier: BUSL-1.1
// Licensed under the Business Source License 1.1 (see LICENSE); Change Date: four years from publication; Change License: Apache-2.0
// Copyright (c) 2026 Empower Agile
import {
  ControlEscape,
  type EnterEvent,
  type EventConsumer,
  type ExitEvent,
  errorMessage,
  errorTypeName,
  humanName,
  type SpanId,
  type TraceEvent,
  type TraceId,
} from "@narrativetrace/core";
import type { Level, Logger } from "pino";

/**
 * Per-event log levels. Defaults follow the Java SLF4J listener's intent: entry/return are `trace`
 * (pino has a real TRACE level, unlike winston) and exceptions are `warn`, not `error`, so a
 * handled-and-narrated failure does not masquerade as an unhandled logger error.
 */
export interface PinoConsumerOptions {
  readonly levels?: {
    readonly enter?: Level;
    readonly return?: Level;
    readonly exception?: Level;
  };
}

const DEFAULT_LEVELS = { enter: "trace", return: "trace", exception: "warn" } as const;

interface Frame {
  readonly parentSpanId: SpanId | null;
  readonly depth: number;
}

function resolveDepth(frames: Map<SpanId, Frame>, parentSpanId: SpanId | null): number {
  if (parentSpanId === null) return 0;
  return (frames.get(parentSpanId)?.depth ?? -1) + 1;
}

/** Trace-identity + service.* keys emitted on every line so each log is self-correlating. */
function identityMeta(sc: EnterEvent["spanContext"] | ExitEvent["spanContext"]) {
  return {
    trace_id: sc.traceId,
    "nt.traceName": humanName(sc.traceId as TraceId),
    span_id: sc.spanId,
    ...(sc.parentSpanId !== null && { parent_span_id: sc.parentSpanId }),
    ...(sc.serviceName !== undefined && { "service.name": sc.serviceName }),
    ...(sc.serviceVersion !== undefined && { "service.version": sc.serviceVersion }),
    ...(sc.environment !== undefined && { "service.environment": sc.environment }),
    ...(sc.storyId !== undefined && { "nt.storyId": sc.storyId }),
    ...(sc.chapterId !== undefined && { "nt.chapterId": sc.chapterId }),
  };
}

const ENTER_SCHEMA = {
  "nt.entryType": "entry",
  "nt.eventType": "method_enter",
  "nt.schemaVersion": "1.0",
};

const EXIT_SCHEMA = {
  "nt.entryType": "entry",
  "nt.eventType": "method_exit",
  "nt.schemaVersion": "1.0",
};

function enterMeta(
  signature: EnterEvent["signature"],
  sc: EnterEvent["spanContext"],
  depth: number,
) {
  const { className, methodName, parameters } = signature;
  return {
    "code.namespace": className,
    "code.function": methodName,
    "nt.depth": depth,
    "nt.parameters": parameters.map((p) => ({ name: p.name, value: p.renderedValue })),
    ...identityMeta(sc),
    ...ENTER_SCHEMA,
  };
}

function logEnter(
  logger: Logger,
  frames: Map<SpanId, Frame>,
  level: Level,
  event: EnterEvent,
): void {
  const { className, methodName } = event.signature;
  const sc = event.spanContext;
  const depth = resolveDepth(frames, sc.parentSpanId);
  frames.set(sc.spanId, { parentSpanId: sc.parentSpanId, depth });
  logger[level](enterMeta(event.signature, sc, depth), `→ ${className}.${methodName}`);
}

function exitMeta(outcome: string, sc: ExitEvent["spanContext"], depth: number) {
  return { "nt.outcome": outcome, "nt.depth": depth, ...identityMeta(sc), ...EXIT_SCHEMA };
}

/**
 * Pops the exiting span's frame and reports the depth we return **to** (the parent's), Java's
 * `max(0, depth-1)` — a root exit reports 0, not -1.
 */
function exitDepth(frames: Map<SpanId, Frame>, spanId: SpanId): number {
  const frame = frames.get(spanId);
  frames.delete(spanId);
  const parent = frame?.parentSpanId != null ? frames.get(frame.parentSpanId) : undefined;
  return parent ? parent.depth : 0;
}

/** `exception.*` fields; the sanitized error context is only emitted when there is one. */
function exceptionFields(type: string, msg: string, safeCtx: string | null) {
  return {
    "exception.type": type,
    "exception.message": msg,
    ...(safeCtx !== null && { "nt.errorContext": safeCtx }),
  };
}

function logThrew(
  logger: Logger,
  level: Level,
  meta: Record<string, unknown>,
  outcome: Extract<ExitEvent["outcome"], { kind: "threw" }>,
): void {
  const type = errorTypeName(outcome.error);
  const msg = errorMessage(outcome.error);
  const safeCtx =
    outcome.errorContext !== null ? ControlEscape.sanitize(outcome.errorContext) : null;
  const message = safeCtx !== null ? `!! ${type}: ${msg} [${safeCtx}]` : `!! ${type}: ${msg}`;
  logger[level]({ ...meta, ...exceptionFields(type, msg, safeCtx) }, message);
}

function logExit(
  logger: Logger,
  frames: Map<SpanId, Frame>,
  levels: Required<NonNullable<PinoConsumerOptions["levels"]>>,
  event: ExitEvent,
): void {
  const sc = event.spanContext;
  const depth = exitDepth(frames, sc.spanId);
  const meta = (outcome: string) => exitMeta(outcome, sc, depth);
  if (event.outcome.kind === "threw") {
    logThrew(logger, levels.exception, meta("threw"), event.outcome);
  } else if (event.outcome.kind === "returned") {
    const rv = event.outcome.renderedValue;
    logger[levels.return]({ ...meta("returned"), "nt.returnValue": rv }, `← returned: ${rv}`);
  } else if (event.outcome.kind === "incomplete") {
    logger[levels.return](meta("incomplete"), "← incomplete");
  }
}

export function createPinoEventConsumer(
  logger: Logger,
  options: PinoConsumerOptions = {},
): EventConsumer {
  const levels = { ...DEFAULT_LEVELS, ...options.levels };
  const frames = new Map<SpanId, Frame>();
  return (event: TraceEvent) => {
    switch (event.type) {
      case "enter":
        return logEnter(logger, frames, levels.enter, event);
      case "exit":
        return logExit(logger, frames, levels, event);
    }
  };
}
