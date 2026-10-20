// SPDX-License-Identifier: BUSL-1.1
// Licensed under the Business Source License 1.1 (see LICENSE); Change Date: four years from publication; Change License: Apache-2.0
// Copyright (c) 2026 Empower Agile
import { isValidSpanId, isValidTraceId, type SpanId, type TraceId } from "./span-id-generator.js";

const TRACEPARENT_REGEX = /^([0-9a-f]{2})-([0-9a-f]{32})-([0-9a-f]{16})-([0-9a-f]{2})$/;

/**
 * The one version byte the W3C spec currently reserves and forbids outright — every other
 * unassigned value (`01`-`fe`) is at least structurally acceptable to a version-`00` reader, but
 * `ff` is explicitly never valid, in any version.
 */
const FORBIDDEN_VERSION = "ff";

/**
 * What a valid W3C `traceparent` header names: the trace to continue, the caller's span that made
 * the request, and the sampling flags byte.
 *
 * @llmNote Pass it, as returned, to `NarrativeContext.run` as the inherited trace: the callee's
 * root span then records `traceId` as its trace and `parentSpanId` as its parent, which is the
 * link between the two services' traces. Equivalent to Java's `Traceparent` record.
 */
export interface Traceparent {
  readonly traceId: TraceId;
  /** The caller's span id (the header's parent-id field), never all-zero. */
  readonly parentSpanId: SpanId;
  /** The header's flags byte as a number, `0`-`255` (`1` = sampled). */
  readonly traceFlags: number;
}

/**
 * Reads a W3C `traceparent` header so an incoming request can continue an upstream trace and
 * record the upstream span as its root's parent.
 *
 * @param header the raw header value, or `undefined` when absent.
 * @returns the trace id, parent span id and flags, or `undefined` — never throws — when the header
 * is missing, malformed, carries an all-zero (invalid) trace id or parent span id, or names the
 * forbidden version `ff`.
 */
export function parseTraceparent(header: string | undefined): Traceparent | undefined {
  if (!header) return undefined;
  const match = TRACEPARENT_REGEX.exec(header);
  if (!match) return undefined;
  const [, version, traceId, spanId, flags] = match as unknown as [
    string,
    string,
    string,
    string,
    string,
  ];
  if (version === FORBIDDEN_VERSION) return undefined;
  if (!isValidSpanId(spanId) || !isValidTraceId(traceId)) return undefined;
  return { traceId, parentSpanId: spanId, traceFlags: Number.parseInt(flags, 16) };
}

/**
 * Builds a W3C `traceparent` header (version `00`) for propagating the current span to a downstream
 * service.
 *
 * @param flags trace-flags byte; defaults to `1` (sampled). Rendered as 2 lowercase hex digits.
 * @returns the `00-<traceId>-<spanId>-<flags>` header string.
 */
export function formatTraceparent(traceId: TraceId, spanId: SpanId, flags = 1): string {
  return `00-${traceId}-${spanId}-${flags.toString(16).padStart(2, "0")}`;
}
