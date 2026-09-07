// SPDX-License-Identifier: BUSL-1.1
// Licensed under the Business Source License 1.1 (see LICENSE); Change Date: four years from publication; Change License: Apache-2.0
// Copyright (c) 2026 Empower Agile
import type { ClientIp, EnduserId, HttpRoute, SessionId, TenantId } from "./branded-types.js";
import type { ServiceIdentity } from "./service-identity.js";
import type { SpanId, TraceId } from "./span-id-generator.js";

/**
 * Distributed-trace identity and correlation metadata for one span.
 *
 * INTENT: the OTel-aligned "where in the trace" attached to enter/exit events and, optionally, to a
 * {@link TraceNode}. Beyond the required `traceId`/`spanId`/`parentSpanId` linkage, it carries
 * optional service, W3C trace-context, HTTP, end-user, and narrative (`storyId`/`chapterId`) fields
 * that exporters map to resource/trace/span attribute tiers (see {@link spanContextFieldTier}).
 * `parentSpanId` is `null` at the trace root.
 */
export interface SpanContext {
  readonly traceId: TraceId;
  readonly spanId: SpanId;
  readonly parentSpanId: SpanId | null;
  readonly serviceName?: string;
  readonly serviceVersion?: string;
  readonly environment?: string;
  readonly traceFlags?: number;
  readonly traceState?: string;
  readonly httpMethod?: string;
  readonly httpRoute?: HttpRoute;
  readonly clientIp?: ClientIp;
  readonly enduserId?: EnduserId;
  readonly sessionId?: SessionId;
  readonly tenantId?: TenantId;
  readonly spanName?: string;
  readonly storyId?: string;
  readonly chapterId?: string;
}

/**
 * The optional, non-identity fields of a {@link SpanContext}, bundled so {@link spanContext} can
 * accept them as one argument. Every field is optional and merged in only when defined.
 */
export interface SpanContextExtras {
  readonly traceFlags?: number;
  readonly traceState?: string;
  readonly httpMethod?: string;
  readonly httpRoute?: HttpRoute;
  readonly clientIp?: ClientIp;
  readonly enduserId?: EnduserId;
  readonly sessionId?: SessionId;
  readonly tenantId?: TenantId;
  readonly spanName?: string;
  readonly storyId?: string;
  readonly chapterId?: string;
}

/**
 * Builds a frozen {@link SpanContext} from required identity plus optional service/extra metadata.
 *
 * @param traceId trace this span belongs to.
 * @param spanId this span's identifier.
 * @param parentSpanId enclosing span, or `null` when this is the trace root.
 * @param service optional service identity; each defined sub-field is merged in.
 * @param extras optional trace-context/HTTP/end-user/narrative fields; only defined ones are kept.
 */
export function spanContext(
  traceId: TraceId,
  spanId: SpanId,
  parentSpanId: SpanId | null,
  service?: ServiceIdentity,
  extras?: SpanContextExtras,
): SpanContext {
  return Object.freeze({
    traceId,
    spanId,
    parentSpanId,
    ...spreadService(service),
    ...spreadExtras(extras),
  });
}

function spreadService(s?: ServiceIdentity): Partial<SpanContext> {
  if (s === undefined) return {};
  return {
    ...(s.serviceName !== undefined && { serviceName: s.serviceName }),
    ...(s.serviceVersion !== undefined && { serviceVersion: s.serviceVersion }),
    ...(s.environment !== undefined && { environment: s.environment }),
  };
}

function spreadExtras(e?: SpanContextExtras): Partial<SpanContext> {
  if (e === undefined) return {};
  return {
    ...(e.traceFlags !== undefined && { traceFlags: e.traceFlags }),
    ...(e.traceState !== undefined && { traceState: e.traceState }),
    ...(e.httpMethod !== undefined && { httpMethod: e.httpMethod }),
    ...(e.httpRoute !== undefined && { httpRoute: e.httpRoute }),
    ...(e.clientIp !== undefined && { clientIp: e.clientIp }),
    ...(e.enduserId !== undefined && { enduserId: e.enduserId }),
    ...(e.sessionId !== undefined && { sessionId: e.sessionId }),
    ...(e.tenantId !== undefined && { tenantId: e.tenantId }),
    ...(e.spanName !== undefined && { spanName: e.spanName }),
    ...(e.storyId !== undefined && { storyId: e.storyId }),
    ...(e.chapterId !== undefined && { chapterId: e.chapterId }),
  };
}
