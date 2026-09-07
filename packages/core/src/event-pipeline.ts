// SPDX-License-Identifier: BUSL-1.1
// Licensed under the Business Source License 1.1 (see LICENSE); Change Date: four years from publication; Change License: Apache-2.0
// Copyright (c) 2026 Empower Agile
import type { SpanId } from "./span-id-generator.js";
import type { TraceEvent } from "./trace-event.js";

/** A synchronous sink for a single {@link TraceEvent} (e.g. an OTel bridge or test spy). */
export type EventConsumer = (event: TraceEvent) => void;

/**
 * The transport between a {@link NarrativeContext} and event storage/listeners.
 *
 * INTENT: decouples capture from delivery so events can fan out to a buffered store and optional
 * synchronous listeners. The default is {@link DualPathPipeline}.
 *
 * @remarks Fail-safe posture: implementations must isolate delivery failures — a throwing consumer
 * must never surface to the traced business call.
 */
export interface EventPipeline {
  publish(event: TraceEvent): void;
  flush(): void;
  events(): readonly TraceEvent[];
  clear(): void;
  /**
   * Request-scoped cleanup: remove only the events owned by the given span ids.
   * Optional — only store-backed pipelines can honour it; callers must fall back
   * to a coarser strategy when it is absent.
   */
  removeSpans?(spanIds: ReadonlySet<SpanId>): void;
  /**
   * Events this pipeline shed under load, monotonic since it was created.
   *
   * Optional — only buffered pipelines can lose an event, and a pipeline that cannot reports
   * nothing rather than a misleading zero. Read it through `NarrativeContext.traceLoss()`.
   */
  droppedEventCount?(): number;
  /**
   * Removes the given spans' stored events because no live request can report them any longer —
   * their origin was reset or collected before the work handed itself over.
   *
   * Optional, same fallback rule as {@link removeSpans}. Distinct from `removeSpans`: that is
   * ordinary owned-spans cleanup on a request that is still capturing; this is a permanent discard
   * of work whose request has already ended, and it is what {@link discardedSpanCount} counts.
   */
  discardSpans?(spanIds: ReadonlySet<SpanId>): void;
  /**
   * Spans discarded via {@link discardSpans}, monotonic since this pipeline was created.
   *
   * Optional, same fallback rule as {@link droppedEventCount}. Read it through
   * `NarrativeContext.traceLoss()`.
   */
  discardedSpanCount?(): number;
  close(): void;
}
