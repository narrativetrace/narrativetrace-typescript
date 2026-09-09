// SPDX-License-Identifier: BUSL-1.1
// Licensed under the Business Source License 1.1 (see LICENSE); Change Date: four years from publication; Change License: Apache-2.0
// Copyright (c) 2026 Empower Agile
import type { TraceEvent } from "./trace-event.js";

/**
 * A **fixed-size** bounded ring of trace events, allocated on first use.
 *
 * INTENT: give the capture path a constant, predictable memory footprint. The ring is exactly
 * `capacity` slots — the size the caller configured — from the first {@link put} onwards; it never
 * grows, never shrinks and never reallocates. At the cap the oldest unread event is overwritten and
 * counted in {@link overflowCount}: the buffer drops rather than blocking the traced call.
 *
 * @remarks Allocation is deferred to the first {@link put} so a context that never buffers an event
 * costs nothing ({@link allocatedCapacity} stays `0`). That is allocation *timing*, not growth: the
 * one allocation that happens is the full ring. Sizing is therefore a single decision made up front
 * — see `documentation/configuration-guide.md` §8 — rather than something the buffer discovers
 * under load. {@link fillLevel} is relative to `capacity`, which is also the allocation, so the
 * drain modes keyed off it mean the same thing at every moment of the buffer's life.
 */
export class BoundedEventBuffer {
  readonly capacity: number;
  private buffer: (TraceEvent | undefined)[] = [];
  private writeIndex = 0;
  private readIndex = 0;
  private _overflowCount = 0;

  constructor(capacity: number) {
    if (!Number.isInteger(capacity) || capacity < 1) {
      throw new Error("capacity must be a positive integer");
    }
    this.capacity = capacity;
  }

  put(event: TraceEvent): void {
    if (this.buffer.length === 0) this.allocateRing();
    if (this.isFull()) this._overflowCount++;
    this.buffer[this.writeIndex % this.capacity] = event;
    this.writeIndex++;
  }

  /**
   * Reads `[oldestIndex(), oldestIndex() + count)` through `consumer`, then advances `readIndex`
   * past exactly what was read — the "claim" half of `BufferedEventConsumer.flush()`'s barrier
   * contract.
   *
   * @llmNote `start`/`count` are computed once, before the loop, from the state at call time — a
   * `put()` that lands reentrantly *during* `consumer(event)` (a synchronous subscriber tracing
   * more work) extends `writeIndex` past this call's range and is left for a later drain, never
   * double-read. This method and every function `consumer` can transitively be (see `flush`'s
   * `@llmNote`) must stay synchronous, with no `await`: the "claim" (this method) and the "account"
   * (what `consumer` does with each event, e.g. `store.accept`) must complete as one atomic,
   * uninterruptible unit of JS execution, or an event can end up counted as read here without yet
   * being stored/counted by `consumer` — exactly the window a caller's `flush()` must never expose.
   */
  drain(consumer: (event: TraceEvent) => void, limit?: number): number {
    const start = this.oldestIndex();
    const available = this.writeIndex - start;
    const count = limit !== undefined ? Math.max(0, Math.min(available, limit)) : available;
    for (let i = start; i < start + count; i++) {
      consumer(this.buffer[i % this.capacity]!);
    }
    this.readIndex = start + count;
    return count;
  }

  /** Empties the ring without releasing it: the allocation is the buffer's whole point. */
  clear(): void {
    this.buffer.fill(undefined);
    this.writeIndex = 0;
    this.readIndex = 0;
  }

  get size(): number {
    return Math.min(this.writeIndex - this.readIndex, this.capacity);
  }

  get fillLevel(): number {
    return this.size / this.capacity;
  }

  /** Ring slots allocated: `0` before the first event, then exactly {@link capacity}, for good. */
  get allocatedCapacity(): number {
    return this.buffer.length;
  }

  /**
   * Events lost because the buffer stood at its cap and overwrote the oldest unread event.
   *
   * @remarks Monotonic for the buffer's lifetime — {@link clear} resets the ring, not the tally, so
   * a total loss count stays observable across request-scoped clears.
   */
  get overflowCount(): number {
    return this._overflowCount;
  }

  /** Absolute index of the oldest still-readable event; later than `readIndex` after an overwrite. */
  private oldestIndex(): number {
    return Math.max(this.readIndex, this.writeIndex - this.capacity);
  }

  private isFull(): boolean {
    return this.writeIndex - this.readIndex >= this.capacity;
  }

  /**
   * The one allocation in this class's life: the whole ring, at its configured size.
   *
   * @remarks Called only from {@link put}, and only while `buffer.length` is `0` — which the
   * assignment below makes false for every subsequent call, since `capacity` is at least 1. That
   * is what "never reallocates" means mechanically.
   */
  private allocateRing(): void {
    this.buffer = new Array<TraceEvent | undefined>(this.capacity);
  }
}
