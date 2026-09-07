// SPDX-License-Identifier: BUSL-1.1
// Licensed under the Business Source License 1.1 (see LICENSE); Change Date: four years from publication; Change License: Apache-2.0
// Copyright (c) 2026 Empower Agile
import { BufferedEventConsumer } from "./buffered-event-consumer.js";
import type { EventConsumer, EventPipeline } from "./event-pipeline.js";
import type { SpanId } from "./span-id-generator.js";
import type { TraceEvent } from "./trace-event.js";

/**
 * The default {@link EventPipeline}: fans each event to an optional synchronous consumer and an
 * optional best-effort buffered consumer, isolating both.
 *
 * INTENT: split "someone listening live" (the sync path, e.g. an OTel bridge) from "durable
 * capture for trace assembly" (the buffered path). Either may be `null`.
 *
 * @remarks Fail-safe posture: both delivery paths are wrapped in try/catch, so a buggy listener or
 * a full buffer can never break the traced business call.
 */
export class DualPathPipeline implements EventPipeline {
  constructor(
    private readonly syncConsumer: EventConsumer | null,
    private readonly bestEffort: BufferedEventConsumer | null,
  ) {}

  publish(event: TraceEvent): void {
    // Observability failure must never become an application failure. Both
    // delivery paths are isolated so a buggy listener cannot break the traced
    // business call.
    if (this.syncConsumer !== null) {
      try {
        this.syncConsumer(event);
      } catch {
        // ignored
      }
    }
    if (this.bestEffort !== null) {
      try {
        this.bestEffort.accept(event);
      } catch {
        // ignored
      }
    }
  }

  flush(): void {
    this.bestEffort?.flush();
  }

  events(): readonly TraceEvent[] {
    return this.bestEffort?.events() ?? [];
  }

  clear(): void {
    this.bestEffort?.clear();
  }

  removeSpans(spanIds: ReadonlySet<SpanId>): void {
    this.bestEffort?.removeSpans(spanIds);
  }

  discardSpans(spanIds: ReadonlySet<SpanId>): void {
    this.bestEffort?.discardSpans(spanIds);
  }

  droppedEventCount(): number {
    return this.bestEffort?.overflowCount() ?? 0;
  }

  discardedSpanCount(): number {
    return this.bestEffort?.discardedSpanCount() ?? 0;
  }

  close(): void {
    this.bestEffort?.close();
  }
}

/**
 * Guarantees a pipeline is backed by a buffered store so trace assembly and request-scoped cleanup
 * work.
 *
 * INTENT: use when handed an arbitrary {@link EventPipeline} that may only forward events. Returns
 * the input unchanged if it is already a {@link DualPathPipeline}; otherwise wraps it so its
 * `publish` becomes the sync path and a fresh {@link BufferedEventConsumer} provides storage.
 */
export function ensureStoreBacked(pipeline: EventPipeline): EventPipeline {
  if (pipeline instanceof DualPathPipeline) return pipeline;
  const bestEffort = new BufferedEventConsumer();
  return new DualPathPipeline((e) => pipeline.publish(e), bestEffort);
}
