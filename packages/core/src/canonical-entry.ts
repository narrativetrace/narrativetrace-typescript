// SPDX-License-Identifier: BUSL-1.1
// Licensed under the Business Source License 1.1 (see LICENSE); Change Date: four years from publication; Change License: Apache-2.0
// Copyright (c) 2026 Empower Agile
import type { SpanContext } from "./span-context.js";
import type { TraceId } from "./span-id-generator.js";
import type {
  EnterEvent,
  ExitEvent,
  ForkCreatedEvent,
  JoinCompleteEvent,
  TraceEvent,
} from "./trace-event.js";
import { humanName } from "./trace-namer.js";

/**
 * One flat, OTel-aligned log record projected from a {@link TraceEvent}.
 *
 * INTENT: the export shape for structured-logging sinks — a single JSON object per event using
 * canonical `code.*` / `nt.*` / `exception.*` attribute keys and a fixed `nt.schemaVersion`. The
 * many optional fields are populated per event kind (enter carries `nt.parameters`, exit carries
 * outcome/return or exception fields); consumers should treat absent keys as not-applicable.
 */
export interface CanonicalEntry {
  readonly timestamp: string;
  readonly level: string;
  readonly message: string;
  readonly trace_id: string;
  readonly span_id: string;
  readonly parent_span_id: string | null;
  readonly "code.namespace": string;
  readonly "code.function": string;
  readonly "nt.entryType": "entry";
  readonly "nt.eventType": string;
  readonly "nt.schemaVersion": typeof SCHEMA_VERSION;
  readonly "nt.traceName": string;
  readonly "nt.storyId"?: string;
  readonly "nt.chapterId"?: string;
  readonly "nt.outcome"?: EntryOutcome;
  readonly "nt.parameters"?: readonly { name: string; value: string }[];
  readonly "nt.returnValue"?: string | null;
  /** Call duration in milliseconds; present on exit entries derived from a finished tree. */
  readonly durationMs?: number;
  readonly "exception.type"?: string;
  readonly "exception.message"?: string;
  readonly service: string;
  readonly environment?: string;
}

/**
 * The canonical output schema version stamped on every entry and chapter.
 *
 * INTENT: one constant, because the version was a string literal at five sites and stayed at `1.0`
 * through two schema releases. `entry.schema.json` and `chapter.schema.json` both pin it as a
 * `const`, so a stale stamp fails conformance rather than shipping quietly.
 *
 * @remarks 1.1 added `nt.narrationTemplate`; 1.2 added additive nullable identity fields (packages,
 * `nt.returnType`, parameter `type`, thread and process identity, `nt.instanceId`, source
 * location). Every addition is optional, so a 1.0 consumer still reads a 1.2 document.
 *
 * Not to be confused with the chapter-tree envelope's own `version`, which is still `1.0` and
 * moves independently — see `schema/README.md`.
 */
export const SCHEMA_VERSION = "1.2" as const;

/**
 * The OTel-facing outcome vocabulary of a canonical entry, as `entry.schema.json` enumerates it.
 *
 * @remarks Deliberately *not* the capture model's `returned`/`threw`/`incomplete`: those words
 * describe control flow and stay inside the chapter-tree envelope, while an entry is a log record
 * read by ingestion pipelines that expect success/failure. Java maps the same three cases the same
 * way (`CanonicalEntryMapper.mapOutcome`).
 */
export type EntryOutcome = "success" | "failure" | "incomplete";

/**
 * Service name stamped on entries when the host pins none.
 *
 * `service` is required by `entry.schema.json`, so it must never be absent or blank.
 * This is OpenTelemetry's convention for "nobody said": `unknown_service:` plus the
 * runtime name. Cross-port contract (owner decision, 2026-08-28): every NarrativeTrace
 * port emits `unknown_service:<runtime>` with its own fixed suffix — `:java`, `:node`,
 * `:python`, `:dotnet`, `:swift`. The suffix is a literal, not a lookup of the running
 * executable, so the value stays deterministic across restarts and deployments;
 * conformance fixtures normalise the suffix away before comparing goldens.
 */
export const UNKNOWN_SERVICE = "unknown_service:node";

/** The pinned service name, or {@link UNKNOWN_SERVICE} when the host pinned none. */
export function serviceNameOrUnknown(serviceName: string | undefined): string {
  return serviceName === undefined || serviceName.trim() === "" ? UNKNOWN_SERVICE : serviceName;
}

function baseFields(sc: SpanContext, eventType: string) {
  return {
    timestamp: new Date().toISOString(),
    trace_id: sc.traceId,
    span_id: sc.spanId,
    parent_span_id: sc.parentSpanId,
    "nt.entryType": "entry" as const,
    "nt.eventType": eventType,
    "nt.schemaVersion": SCHEMA_VERSION,
    "nt.traceName": humanName(sc.traceId as TraceId),
    ...(sc.storyId !== undefined && { "nt.storyId": sc.storyId }),
    ...(sc.chapterId !== undefined && { "nt.chapterId": sc.chapterId }),
    service: serviceNameOrUnknown(sc.serviceName),
    ...(sc.environment !== undefined && { environment: sc.environment }),
  };
}

function mapEnter(event: EnterEvent): CanonicalEntry {
  const { className, methodName, parameters } = event.signature;
  return {
    ...baseFields(event.spanContext, "method_enter"),
    level: "trace",
    message: `→ ${className}.${methodName}`,
    "code.namespace": className,
    "code.function": methodName,
    ...(parameters.length > 0 && {
      "nt.parameters": parameters.map((p) => ({ name: p.name, value: p.renderedValue })),
    }),
  };
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function errorType(error: unknown): string {
  return error instanceof Error ? error.constructor.name : typeof error;
}

function threwFields(error: unknown): Partial<CanonicalEntry> {
  const msg = errorMessage(error);
  return {
    level: "error",
    message: `!! Error: ${msg}`,
    "nt.outcome": "failure",
    "exception.type": errorType(error),
    "exception.message": msg,
  };
}

// A void completion carries no value: the key is omitted rather than set to null, matching the
// chapter-tree envelope, and the message says the method returned rather than naming a non-value.
function returnedFields(renderedValue: string | null): Partial<CanonicalEntry> {
  if (renderedValue === null) {
    return { level: "trace", message: "← returned", "nt.outcome": "success" };
  }
  return {
    level: "trace",
    message: `← returned: ${renderedValue}`,
    "nt.outcome": "success",
    "nt.returnValue": renderedValue,
  };
}

function outcomeFields(outcome: ExitEvent["outcome"]): Partial<CanonicalEntry> {
  if (outcome.kind === "threw") return threwFields(outcome.error);
  if (outcome.kind === "returned") return returnedFields(outcome.renderedValue);
  return { level: "trace", message: "← incomplete", "nt.outcome": "incomplete" };
}

function mapExit(event: ExitEvent): CanonicalEntry {
  return {
    ...baseFields(event.spanContext, "method_exit"),
    "code.namespace": "",
    "code.function": "",
    ...outcomeFields(event.outcome),
  } as CanonicalEntry;
}

function mapFork(event: ForkCreatedEvent): CanonicalEntry {
  return {
    timestamp: new Date().toISOString(),
    level: "trace",
    message: `⑂ ${event.strategy} group ${event.groupId}`,
    trace_id: "",
    span_id: event.rootSpanId,
    parent_span_id: event.parentSpanId,
    "code.namespace": "",
    "code.function": "",
    "nt.entryType": "entry",
    "nt.eventType": "fork",
    "nt.schemaVersion": SCHEMA_VERSION,
    "nt.traceName": "",
    service: UNKNOWN_SERVICE,
  };
}

function mapJoin(event: JoinCompleteEvent): CanonicalEntry {
  return {
    timestamp: new Date().toISOString(),
    level: "trace",
    message: `⑂ join complete: ${event.memberCount} members in ${event.wallTimeMs.toFixed(1)}ms`,
    trace_id: "",
    span_id: "",
    parent_span_id: null,
    "code.namespace": "",
    "code.function": "",
    "nt.entryType": "entry",
    "nt.eventType": "join",
    "nt.schemaVersion": SCHEMA_VERSION,
    "nt.traceName": "",
    service: UNKNOWN_SERVICE,
  };
}

/**
 * Projects any {@link TraceEvent} into its {@link CanonicalEntry} log record.
 *
 * INTENT: the single mapping seam between in-memory trace events and the flat structured-log wire
 * format; dispatches on `event.type` (enter/exit/fork/join) to the matching field layout.
 *
 * @remarks Stamps `timestamp` from `Date.now()` at call time, so invoke it at emit time. Fork/join
 * entries intentionally leave `trace_id`/`nt.traceName` empty since they describe group edges, not a call.
 */
export function toCanonicalEntry(event: TraceEvent): CanonicalEntry {
  switch (event.type) {
    case "enter":
      return mapEnter(event);
    case "exit":
      return mapExit(event);
    case "fork-created":
      return mapFork(event);
    case "join-complete":
      return mapJoin(event);
  }
}
