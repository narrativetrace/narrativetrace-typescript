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
   * Removes only the enter/exit events belonging to the given span ids, leaving
   * other traces' events (and group lifecycle events) untouched. Request-scoped
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

function spanIdOf(event: TraceEvent): SpanId | null {
  if (event.type === "enter" || event.type === "exit") {
    return event.spanContext.spanId;
  }
  return null;
}
