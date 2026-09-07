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
 * Extracts the trace id from a W3C `traceparent` header so an incoming request can continue an
 * upstream trace.
 *
 * @param header the raw header value, or `undefined` when absent.
 * @returns the 32-hex trace id, or `undefined` — never throws — when the header is missing,
 * malformed, carries an all-zero (invalid) trace id or parent span id, or names the forbidden
 * version `ff`.
 */
export function parseTraceparent(header: string | undefined): TraceId | undefined {
  if (!header) return undefined;
  const match = TRACEPARENT_REGEX.exec(header);
  if (!match) return undefined;
  const [, version, traceId, spanId] = match as unknown as [string, string, string, string];
  if (version === FORBIDDEN_VERSION) return undefined;
  if (!isValidSpanId(spanId)) return undefined;
  return isValidTraceId(traceId) ? traceId : undefined;
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
