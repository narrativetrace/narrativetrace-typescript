// SPDX-License-Identifier: BUSL-1.1
// Licensed under the Business Source License 1.1 (see LICENSE); Change Date: four years from publication; Change License: Apache-2.0
// Copyright (c) 2026 Empower Agile
import type { SpanId } from "./span-id-generator.js";
import type { TraceEvent } from "./trace-event.js";

/**
 * The durable end of the buffered path: retains drained events in insertion order.
 *
 * INTENT: back trace assembly ({@link events}) from a single accept stream. Fed by
 * {@link BufferedEventConsumer} during drain; not written to directly by contexts. Multi-invocation
 * aggregation is a Pro-tier extension, added in Phase 31a.
 */
export class EventStoreConsumer {
  private readonly store: TraceEvent[] = [];

  accept(event: TraceEvent): void {
    this.store.push(event);
  }

  events(): readonly TraceEvent[] {
    return this.store;
  }

  clear(): void {
    this.store.length = 0;
  }

  /**
   * Removes only the enter/exit events of the given span ids and the group lifecycle events they own, leaving
   * other traces' events (and group events created outside every span) untouched. Request-scoped
   * cleanup: a finishing request drops its own events without disturbing other
   * in-flight traces sharing this store.
   */
  removeSpans(spanIds: ReadonlySet<SpanId>): void {
    if (spanIds.size === 0) return;
    const retained = this.store.filter((event) => {
      const spanId = spanIdOf(event);
      return spanId === null || !spanIds.has(spanId);
    });
    this.store.length = 0;
    this.store.push(...retained);
  }
}

/**
 * The span id an event belongs to: an enter or exit event's own span, a group lifecycle event's
 * owning span (the span that launched the group). `null` when there is none — a group created
 * outside every span, which therefore stays retained (documented limit).
 *
 * INTENT: retention keys on this. A request's end removes every event whose span id is one of the
 * request's spans, so a group event leaves with the request that launched it.
 */
export function spanIdOf(event: TraceEvent): SpanId | null {
  switch (event.type) {
    case "enter":
    case "exit":
      return event.spanContext.spanId;
    case "fork-created":
      return event.parentSpanId === "" ? null : (event.parentSpanId as SpanId);
    case "join-complete":
      return (event.ownerSpanId as SpanId | null) ?? null;
  }
}
