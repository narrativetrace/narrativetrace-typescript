// SPDX-License-Identifier: BUSL-1.1
// Licensed under the Business Source License 1.1 (see LICENSE); Change Date: four years from publication; Change License: Apache-2.0
// Copyright (c) 2026 Empower Agile
import { getIdGenerator } from "./id-generator.js";

declare const TraceIdBrand: unique symbol;
/**
 * A W3C-style trace identifier: 32 lowercase hex chars, never all-zero.
 *
 * INTENT: branded so a raw string cannot be passed where a validated trace id is
 * expected; mint via {@link generateTraceId} and narrow untrusted input with
 * {@link isValidTraceId}.
 */
export type TraceId = string & { readonly [TraceIdBrand]: true };

declare const SpanIdBrand: unique symbol;
/**
 * A W3C-style span identifier: 16 lowercase hex chars, never all-zero.
 *
 * INTENT: branded to keep span ids distinct from arbitrary strings; mint via
 * {@link generateSpanId} and validate untrusted input with {@link isValidSpanId}.
 */
export type SpanId = string & { readonly [SpanIdBrand]: true };

const TRACE_ID_PATTERN = /^[0-9a-f]{32}$/;
const SPAN_ID_PATTERN = /^[0-9a-f]{16}$/;
const ALL_ZERO_TRACE = "00000000000000000000000000000000";
const ALL_ZERO_SPAN = "0000000000000000";

/**
 * Mints a fresh {@link TraceId} from the registered generator.
 *
 * @throws {Error} if no {@link IdGenerator} has been registered (see {@link getIdGenerator}).
 */
export function generateTraceId(): TraceId {
  return getIdGenerator().traceId();
}

/**
 * Mints a fresh {@link SpanId} from the registered generator.
 *
 * @throws {Error} if no {@link IdGenerator} has been registered (see {@link getIdGenerator}).
 */
export function generateSpanId(): SpanId {
  return getIdGenerator().spanId();
}

/**
 * Type guard for externally supplied trace ids (e.g. propagated headers).
 *
 * @returns `true` only for 32 lowercase hex chars that are not the all-zero trace id.
 */
export function isValidTraceId(id: string): id is TraceId {
  return TRACE_ID_PATTERN.test(id) && id !== ALL_ZERO_TRACE;
}

/**
 * Type guard for externally supplied span ids (e.g. propagated headers).
 *
 * @returns `true` only for 16 lowercase hex chars that are not the all-zero span id.
 */
export function isValidSpanId(id: string): id is SpanId {
  return SPAN_ID_PATTERN.test(id) && id !== ALL_ZERO_SPAN;
}
