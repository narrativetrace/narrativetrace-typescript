// SPDX-License-Identifier: BUSL-1.1
// Licensed under the Business Source License 1.1 (see LICENSE); Change Date: four years from publication; Change License: Apache-2.0
// Copyright (c) 2026 Empower Agile
/**
 * The OTel scope a span-context field maps to: `resource` (per-service, e.g. serviceName),
 * `trace` (per-trace, shared across spans, e.g. traceId/httpRoute), or `span` (per-span, e.g.
 * spanId/spanName). Exporters use the tier to decide where each attribute is emitted.
 */
export type AttributeTier = "resource" | "trace" | "span";

/**
 * Authoritative mapping from {@link SpanContext} field name to its {@link AttributeTier}.
 *
 * INTENT: single source of truth so every exporter places a field in the same scope. Fields absent
 * from this map are intentionally not exported as attributes.
 */
export const SPAN_CONTEXT_FIELDS: ReadonlyMap<string, AttributeTier> = new Map([
  ["serviceName", "resource"],
  ["serviceVersion", "resource"],
  ["environment", "resource"],
  ["traceId", "trace"],
  ["httpMethod", "trace"],
  ["httpRoute", "trace"],
  ["clientIp", "trace"],
  ["enduserId", "trace"],
  ["sessionId", "trace"],
  ["tenantId", "trace"],
  ["spanId", "span"],
  ["parentSpanId", "span"],
  ["traceFlags", "span"],
  ["traceState", "span"],
  ["spanName", "span"],
]);

/**
 * Looks up the {@link AttributeTier} for a span-context field, enforcing that only known fields are
 * exported.
 *
 * @param fieldName a {@link SpanContext} property name.
 * @returns the field's tier.
 * @throws {Error} if `fieldName` is not present in {@link SPAN_CONTEXT_FIELDS}.
 */
export function spanContextFieldTier(fieldName: string): AttributeTier {
  const tier = SPAN_CONTEXT_FIELDS.get(fieldName);
  if (tier === undefined) {
    throw new Error(`Unknown SpanContext field: ${fieldName}`);
  }
  return tier;
}
