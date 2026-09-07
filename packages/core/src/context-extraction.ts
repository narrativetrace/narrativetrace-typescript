// SPDX-License-Identifier: BUSL-1.1
// Licensed under the Business Source License 1.1 (see LICENSE); Change Date: four years from publication; Change License: Apache-2.0
// Copyright (c) 2026 Empower Agile
import { BufferedEventConsumer } from "./buffered-event-consumer.js";
import { NarrativeTraceConfig } from "./config.js";
import { SyncNarrativeContext } from "./context.js";
import { DualPathPipeline } from "./dual-path-pipeline.js";
import type { EventPipeline } from "./event-pipeline.js";
import type { NarrativeContext } from "./narrative-context.js";
import type { ServiceIdentity } from "./service-identity.js";
import type { SpanContextExtras } from "./span-context.js";
import type { SpanId, TraceId } from "./span-id-generator.js";

interface ContextInfo {
  config: NarrativeTraceConfig;
  pipeline: EventPipeline;
}

function defaultContextInfo(): ContextInfo {
  return {
    config: new NarrativeTraceConfig(),
    pipeline: new DualPathPipeline(null, new BufferedEventConsumer()),
  };
}

export function extractContextInfo(context: NarrativeContext): ContextInfo {
  if (context instanceof SyncNarrativeContext) {
    return { config: context.config, pipeline: context.eventPipeline };
  }
  if ("config" in context && "eventPipeline" in context) {
    return {
      config: context.config as NarrativeTraceConfig,
      pipeline: context.eventPipeline as EventPipeline,
    };
  }
  if (context.isActive) {
    throw new Error("Active NarrativeContext requires config and eventPipeline properties");
  }
  return defaultContextInfo();
}

export function extractActiveSpanId(context: NarrativeContext): SpanId | null {
  if (context instanceof SyncNarrativeContext) {
    return context.activeSpanId;
  }
  if ("activeSpanId" in context) {
    return context.activeSpanId as SpanId | null;
  }
  return null;
}

export function extractTraceId(context: NarrativeContext): TraceId | null {
  if (context instanceof SyncNarrativeContext) {
    return context.currentTraceId;
  }
  if ("currentTraceId" in context) {
    return context.currentTraceId as TraceId | null;
  }
  return null;
}

export function extractServiceIdentity(context: NarrativeContext): ServiceIdentity | undefined {
  if ("serviceIdentity" in context) {
    return context.serviceIdentity as ServiceIdentity | undefined;
  }
  return undefined;
}

// Request/user metadata (httpRoute, clientIp, enduserId, tenantId, …) is propagated onto forked
// and fire-and-forget children so background spans carry the same identity as the request that
// spawned them (Java ContextSnapshot carries RequestMetadata).
export function extractRequestExtras(context: NarrativeContext): SpanContextExtras {
  const exporter = (context as { exportRequestExtras?: () => SpanContextExtras })
    .exportRequestExtras;
  return typeof exporter === "function" ? exporter.call(context) : {};
}

/**
 * The {@link SyncNarrativeContext} backing `context`'s current scope, or `null` for a context that
 * keeps no span ledger (the no-op context, a test double).
 *
 * @remarks Duck-typed on `activeScope` so `core` stays free of any dependency on the Node seam;
 * `AsyncNarrativeContext` exposes the inner context its `AsyncLocalStorage` scope is running in.
 */
export function extractScope(context: NarrativeContext): SyncNarrativeContext | null {
  if (context instanceof SyncNarrativeContext) return context;
  const scoped = context as { activeScope?: unknown };
  return scoped.activeScope instanceof SyncNarrativeContext ? scoped.activeScope : null;
}

/**
 * Hands a helper's own children to the launching context, so they are reportable there without the
 * helper ever registering as a live child.
 *
 * INTENT: this is the other half of {@link ContextSnapshot.activateWithoutAdoption}. Fork/join and
 * fire-and-forget groups publish their members themselves — at merge, and when each detached task
 * settles — under the span that launched them. Publishing at that moment is what keeps a parent's
 * tree from depending on when a detached child happened to still be running.
 *
 * @param context the launching context; one that keeps no ledger is silently skipped.
 * @param spanIds the child's whole reportable set, offered as one all-or-nothing batch.
 */
export function publishChildrenTo(context: NarrativeContext, spanIds: ReadonlySet<SpanId>): void {
  extractScope(context)?.adopt(spanIds);
}

export function publishForkCreatedEvents(
  pipeline: EventPipeline,
  groupId: string,
  strategy: "fork-join" | "fire-and-forget",
  knownSpanIds: ReadonlySet<SpanId>,
  parentSpanId: SpanId | null,
): void {
  for (const event of pipeline.events()) {
    if (event.type !== "enter" || !knownSpanIds.has(event.spanContext.spanId)) continue;
    if (event.spanContext.parentSpanId !== parentSpanId) continue;
    pipeline.publish({
      type: "fork-created",
      groupId,
      parentSpanId: parentSpanId ?? "",
      rootSpanId: event.spanContext.spanId,
      strategy,
      timestamp: performance.now(),
    });
  }
}
