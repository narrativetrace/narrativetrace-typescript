// SPDX-License-Identifier: BUSL-1.1
// Licensed under the Business Source License 1.1 (see LICENSE); Change Date: four years from publication; Change License: Apache-2.0
// Copyright (c) 2026 Empower Agile
import { BoundedEventBuffer } from "./bounded-event-buffer.js";
import { EventStoreConsumer } from "./event-store-consumer.js";
import type { SpanId } from "./span-id-generator.js";
import type { TraceEvent } from "./trace-event.js";

const DEFAULT_CAPACITY = 1 << 16;
const DEFAULT_DRAIN_INTERVAL_MS = 100;
const DEFAULT_CHUNK_SIZE = 1024;
const SHEDDING_THRESHOLD = 0.7;
const EMERGENCY_THRESHOLD = 0.9;

/**
 * How many extra terminal drains {@link BufferedEventConsumer.close} spends absorbing publishes
 * that land reentrantly during its own drain — a subscriber's `onEvent` synchronously tracing more
 * work on a context sharing this consumer. Bounded so a pathological subscriber that always
 * republishes cannot loop forever; sized like Java's `ThreadLocalNarrativeContext.DRAIN_ATTEMPTS`,
 * enough to absorb a real cascade without pretending to solve an infinite one.
 */
const CLOSE_DRAIN_ATTEMPTS = 64;

/**
 * Load-adaptive drain strategy chosen per cycle from buffer fill level.
 *
 * @remarks `normal` stores and fans out every event; `shedding` (fill > 70%) drains and drops
 * events (shedding detail) without storing or notifying, to relieve pressure; `emergency`
 * (fill > 90%) likewise discards drained events outright.
 */
export type DrainMode = "normal" | "shedding" | "emergency";

/**
 * A live listener notified as events are drained.
 *
 * @remarks `onEvent` may be async; while a returned promise is pending the subscriber is treated as
 * busy and further events are counted as drops rather than queued (bounded, non-blocking delivery).
 */
export interface TraceSubscriber {
  onEvent(event: TraceEvent): void | Promise<void>;
}

interface SubscriberSlot {
  readonly subscriber: TraceSubscriber;
  busy: boolean;
  droppedCount: number;
  /**
   * Set once a delivery to this subscriber throws or its returned promise rejects — a failing
   * best-effort listener must not be offered every subsequent event forever (no-poison contract;
   * Java's `ListenerFanoutConsumer` disables a listener the same way, on any
   * `Throwable`). Never cleared: a subscriber that misbehaved once is not trusted again this run.
   */
  disabled: boolean;
}

/**
 * The best-effort capture path: buffers accepted events in a **fixed-size** ring and periodically
 * drains them to an {@link EventStoreConsumer}, adapting to load.
 *
 * INTENT: absorb high-throughput event bursts without blocking traced calls and within a memory
 * footprint decided up front. A scheduled drain empties the ring; the store feeds trace assembly.
 * (Multi-invocation aggregation is a Pro-tier extension, added in Phase 31a.)
 *
 * @remarks Fail-safe posture: the buffer is bounded, sheds/drops events under pressure (see
 * {@link DrainMode}), and swallows subscriber failures.
 *
 * Idle costs nothing, by construction — the defaults are sized for a small VM or a cloud function
 * and are safe *without* {@link close}. The ring allocates no slots until the first event
 * ({@link allocatedCapacity} stays `0`), and then allocates it once, whole, at
 * {@link capacity}: it never grows. The drain timer exists only while events are waiting — see
 * {@link startDraining} for why that shape, and why it is deliberately not a shared global timer.
 *
 * Call {@link close} anyway wherever a lifecycle exists (request end, test teardown, shutdown): it
 * is the deterministic path — it drains the tail, stops the timer immediately rather than at the
 * next tick, and releases awaiters of {@link whenClosed} and {@link whenCountReached}.
 */
export class BufferedEventConsumer {
  private readonly buffer: BoundedEventBuffer;
  private readonly store: EventStoreConsumer;
  private readonly drainIntervalMs: number;
  private timer: unknown = undefined;
  private readonly _chunkSize: number;
  private _lastDrainMode: DrainMode = "normal";
  private readonly slots: SubscriberSlot[] = [];
  private _observedCount = 0;
  private _discardedSpanCount = 0;
  private _shedCount = 0;
  private _closed = false;
  private readonly countWaiters: { count: number; resolve: () => void }[] = [];
  private readonly closeWaiters: (() => void)[] = [];

  /**
   * @param capacity - Size of the ring, default `65536`, and so also the cap on undrained events.
   * Fixed, not a ceiling the buffer grows towards: allocation is deferred to the first event, and
   * then it is this whole size. Overflowing it in one drain window takes ~655k events/s at the
   * default interval, far past any real capture rate — durability lives on the pipeline's sync
   * path, not here. Size it with the configuration guide's rule (`peak events/s × worst tolerable
   * drain stall`); retained memory once allocated is ~300 B/event (64k ≈ ~20 MB). A power of two
   * on purpose (`1 << 16`, not 65,535) so ring indexing stays mask-friendly.
   * @param drainIntervalMs - Drain period, default `100`. The timer only runs while events wait.
   * @param chunkSize - Events drained per tick, default `1024`.
   */
  constructor(
    capacity: number = DEFAULT_CAPACITY,
    drainIntervalMs: number = DEFAULT_DRAIN_INTERVAL_MS,
    chunkSize: number = DEFAULT_CHUNK_SIZE,
  ) {
    this.buffer = new BoundedEventBuffer(capacity);
    this.store = new EventStoreConsumer();
    this._chunkSize = chunkSize;
    this.drainIntervalMs = drainIntervalMs;
  }

  accept(event: TraceEvent): void {
    this.buffer.put(event);
    this.startDraining();
  }

  /**
   * Drains **every** buffered event into the store and to subscribers, so query methods observe
   * them.
   *
   * @remarks Deliberately not a drain *cycle*: an explicit flush ignores the chunk size and the
   * adaptive shedding/emergency modes, because the caller is asking for the data rather than
   * relieving pressure. Load-shedding belongs to the timer path alone, and {@link lastDrainMode}
   * is left untouched.
   *
   * @llmNote **Barrier contract** (family parity with Java `BufferedEventConsumer.flush()`, whose
   * `synchronized` drain gives the same guarantee across real OS threads): once this call returns,
   * every event whose {@link accept} had already returned is either counted in {@link events} or in
   * {@link overflowCount} — nothing sits in limbo between the ring's claim (the index bookkeeping in
   * {@link BoundedEventBuffer.drain}) and its account ({@link EventStoreConsumer.accept} /
   * `overflowCount`/shed-count increment). This holds *structurally*, not by locking: the whole
   * `accept → BoundedEventBuffer.put/drain → processNormal → store.accept` chain is synchronous
   * top to bottom with zero `await`/microtask-yield points, so JS's run-to-completion semantics
   * alone rule out another `accept()`, a concurrent `flush()`, or a timer tick running mid-drain —
   * there is no OS thread here for Java's lock to exclude. **Never add `await` inside that chain**
   * (`flush`, {@link drainAll}, `BoundedEventBuffer.drain`, {@link processNormal},
   * `EventStoreConsumer.accept`) without re-deriving this proof; doing so reopens exactly the
   * claim-then-write window Java's `synchronized` block exists to close. Pinned by the concurrent
   * async-producer/flusher interleaving test in `ring-atomicity.stress.test.ts`.
   */
  flush(): void {
    this.drainAll();
    this.stopDrainingIfEmpty();
  }

  events(): readonly TraceEvent[] {
    return this.store.events();
  }

  /** The ring's fixed size — the maximum events that can sit undrained. Never changes. */
  get capacity(): number {
    return this.buffer.capacity;
  }

  /** Ring slots allocated: `0` until the first event, then exactly {@link capacity}, for good. */
  get allocatedCapacity(): number {
    return this.buffer.allocatedCapacity;
  }

  get chunkSize(): number {
    return this._chunkSize;
  }

  get lastDrainMode(): DrainMode {
    return this._lastDrainMode;
  }

  subscribe(subscriber: TraceSubscriber): void {
    this.slots.push({ subscriber, busy: false, droppedCount: 0, disabled: false });
  }

  /**
   * Events not delivered because a subscriber was still busy with a prior async `onEvent`.
   *
   * @remarks Subscriber backpressure only, matching Java's `droppedCount()`. Events lost by the
   * ring itself are a different failure with a different remedy (size the cap up, not the
   * subscriber) and are counted by {@link overflowCount}.
   */
  droppedCount(): number {
    let total = 0;
    for (const slot of this.slots) {
      total += slot.droppedCount;
    }
    return total;
  }

  /**
   * Events lost to load, by either mechanism: the ring overwriting the oldest unread event at its
   * cap, or a drain cycle discarding a chunk under {@link DrainMode} `shedding`/`emergency` before
   * the cap was ever reached.
   *
   * @remarks The load-shedding contract in numbers: at the cap the buffer drops rather than
   * blocking the traced call, and this is where that loss surfaces. A non-zero value means the
   * capture rate outran the drain interval — the remedy is a larger `capacity` (see the
   * configuration guide's sizing rule); the ring will never find the room itself. Monotonic;
   * {@link clear} does not reset it.
   */
  overflowCount(): number {
    return this.buffer.overflowCount + this._shedCount;
  }

  clear(): void {
    this.buffer.clear();
    this.store.clear();
    this.stopDrainingIfEmpty();
  }

  /** Removes only the stored events belonging to the given span ids. */
  removeSpans(spanIds: ReadonlySet<SpanId>): void {
    this.store.removeSpans(spanIds);
  }

  /**
   * Removes the given spans' stored events and counts them in {@link discardedSpanCount} — work
   * whose owning request had already ended (no-poison contract, the async retention class).
   */
  discardSpans(spanIds: ReadonlySet<SpanId>): void {
    if (spanIds.size === 0) return;
    this._discardedSpanCount += spanIds.size;
    this.store.removeSpans(spanIds);
  }

  /** Spans removed via {@link discardSpans}, monotonic; {@link clear} does not reset it. */
  discardedSpanCount(): number {
    return this._discardedSpanCount;
  }

  /** Resolves once at least `count` events have been drained to the store (met → immediate). */
  whenCountReached(count: number): Promise<void> {
    if (this._observedCount >= count) return Promise.resolve();
    return new Promise((resolve) => this.countWaiters.push({ count, resolve }));
  }

  /** Resolves when the consumer is closed — the completion signal for subscribers. */
  whenClosed(): Promise<void> {
    if (this._closed) return Promise.resolve();
    return new Promise((resolve) => this.closeWaiters.push(resolve));
  }

  /**
   * Stops draining and releases awaiters, after draining whatever is still buffered so a shutdown
   * does not silently discard the tail (Java's `close` → `drainRemaining`). Idempotent: a second
   * call drains nothing further.
   */
  close(): void {
    if (this._closed) return;
    this._closed = true;
    this.stopDraining();
    this.drainUntilEmpty();
    for (const resolve of this.closeWaiters.splice(0)) resolve();
    // Unblock any still-pending count waiters so awaiters do not hang after shutdown.
    for (const waiter of this.countWaiters.splice(0)) waiter.resolve();
  }

  /**
   * Drains repeatedly, bounded by {@link CLOSE_DRAIN_ATTEMPTS}, so a publish that lands
   * reentrantly during the terminal drain is still captured rather than stranded: `close()` is the
   * one drain path with no future tick to come back for it, since the timer is already stopped and
   * nothing calls `flush()` again afterwards.
   */
  private drainUntilEmpty(): void {
    for (let attempt = 0; attempt < CLOSE_DRAIN_ATTEMPTS && this.buffer.size > 0; attempt++) {
      this.drainAll();
    }
  }

  /**
   * Starts the drain timer, unless one already runs or the consumer is closed.
   *
   * INTENT: **on-demand scheduled draining** — a timer exists if and only if the buffer is
   * non-empty. Armed by the first event into an empty buffer, cleared by the drain that empties
   * it, re-armed by the next event. One timer per consumer with pending work; zero at idle.
   *
   * @remarks This is the honest translation of Java's per-instance parked drain *thread* (cheap,
   * daemon, woken only when the queue has work). JavaScript has no threads to park, and the
   * original port's literal-looking translation — a per-instance always-firing `setInterval` — was
   * the actual defect: every un-closed consumer kept a live timer, a GC root and a process
   * keep-alive, firing every 100 ms for nothing. Tying the timer's lifetime to the buffer's
   * contents is what makes an idle consumer collectable without {@link close}; `unref()` below is
   * defense in depth (it governs process exit, not reachability).
   *
   * The companion half of the rule lives in {@link stopDrainingIfEmpty}: the timer stops **only**
   * on an empty buffer, so buffered events are always drained even when nothing new arrives. That
   * tail case is the whole reason a drain mechanism exists; nothing may strand events.
   *
   * Deliberately **not** a single process-wide timer. A shared scheduler needs a registry of live
   * consumers, which either roots them (the original leak, restored) or needs
   * `WeakRef`/`FinalizationRegistry` bookkeeping — complexity for no gain, since timers only exist
   * for consumers with pending work, and that count is bounded by genuinely active contexts. Do
   * not "optimise" towards a shared timer later.
   */
  private startDraining(): void {
    if (this.timer !== undefined || this._closed) return;
    const timer = setInterval(() => this.drainCycle(), this.drainIntervalMs);
    // Defense in depth for the same problem: on Node, unref() lets the process exit while a drain
    // is still pending (Java's daemon drain thread). It is absent in the browser, so guard it.
    (timer as { unref?: () => void }).unref?.();
    this.timer = timer;
  }

  /** Unconditional: clearing an absent timer is a no-op on every runtime, so no guard is needed. */
  private stopDraining(): void {
    clearInterval(this.timer);
    this.timer = undefined;
  }

  /**
   * Stops the timer **only** when nothing is left to drain — the never-strand half of the rule.
   *
   * @remarks Every drain path funnels through here (tick, {@link flush}, {@link clear}) precisely
   * so no path can stop a timer over a non-empty buffer. {@link close} is the one exception, and
   * it drains the tail itself first.
   */
  private stopDrainingIfEmpty(): void {
    if (this.buffer.size === 0) this.stopDraining();
  }

  /** One timer tick: drain a chunk, then stop the timer if that emptied the buffer. */
  private drainCycle(): void {
    this.drainOnce();
    this.stopDrainingIfEmpty();
  }

  /**
   * Unlimited, always-storing drain — the flush/shutdown path (Java `drainRemaining`).
   *
   * @llmNote The seam {@link flush}'s barrier contract depends on: synchronous, no `limit`, no
   * `await`. See that doc comment before changing this method's signature or body.
   */
  private drainAll(): void {
    this.buffer.drain((e) => this.processNormal(e));
  }

  /** One adaptive, chunk-limited drain — the timer path (Java `drainCycle`). */
  private drainOnce(): void {
    const fill = this.buffer.fillLevel;
    if (fill > EMERGENCY_THRESHOLD) this.shedChunk("emergency");
    else if (fill > SHEDDING_THRESHOLD) this.shedChunk("shedding");
    else {
      this.buffer.drain((e) => this.processNormal(e), this._chunkSize);
      this._lastDrainMode = "normal";
    }
  }

  // Drops the drained chunk without storing or notifying, to relieve pressure. Counted the same
  // as a ring overwrite in {@link overflowCount}: a reader cannot tell "shed before the cap" from
  // "shed at the cap", both are the buffer losing an event to load.
  private shedChunk(mode: DrainMode): void {
    this._lastDrainMode = mode;
    this._shedCount += this.buffer.drain(() => {}, this._chunkSize);
  }

  private processNormal(event: TraceEvent): void {
    this.store.accept(event);
    this._observedCount++;
    this.notifyCountWaiters();
    for (const slot of this.slots) {
      this.offerToSubscriber(slot, event);
    }
  }

  private notifyCountWaiters(): void {
    for (let i = this.countWaiters.length - 1; i >= 0; i--) {
      const waiter = this.countWaiters[i]!;
      if (this._observedCount >= waiter.count) {
        this.countWaiters.splice(i, 1);
        waiter.resolve();
      }
    }
  }

  private offerToSubscriber(slot: SubscriberSlot, event: TraceEvent): void {
    if (slot.disabled) return;
    if (slot.busy) {
      slot.droppedCount++;
      return;
    }
    const result = this.safeDeliver(slot, event);
    if (result instanceof Promise) this.trackBusy(slot, result);
  }

  private safeDeliver(slot: SubscriberSlot, event: TraceEvent): void | Promise<void> {
    try {
      return slot.subscriber.onEvent(event);
    } catch {
      // A misbehaving subscriber must not break the drain loop or reach the caller that
      // triggered the flush. Synchronous throws are swallowed, not counted as backpressure
      // drops, and disable the slot — a subscriber that failed once is not offered again.
      slot.disabled = true;
      return undefined;
    }
  }

  // Async rejection only clears busy, deliberately not disabling: an async subscriber that
  // rejects once (a transient downstream failure) is expected to recover and keep receiving
  // events, unlike a synchronous throw in safeDeliver, which is this consumer's own call
  // misbehaving and does disable (no-poison contract).
  private trackBusy(slot: SubscriberSlot, result: Promise<void>): void {
    slot.busy = true;
    const release = () => {
      slot.busy = false;
    };
    result.then(release, release);
  }
}
