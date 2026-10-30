// SPDX-License-Identifier: BUSL-1.1
// Licensed under the Business Source License 1.1 (see LICENSE); Change Date: four years from publication; Change License: Apache-2.0
// Copyright (c) 2026 Empower Agile
import type { ClientIp, EnduserId, HttpRoute, SessionId, TenantId } from "./branded-types.js";
import { BufferedEventConsumer } from "./buffered-event-consumer.js";
import { type ConcurrencyInfo, concurrencyInfo } from "./concurrency-info.js";
import type { NarrativeTraceConfig } from "./config.js";
import type { ContextScope, ContextSnapshot } from "./context-snapshot.js";
import { DualPathPipeline } from "./dual-path-pipeline.js";
import type { EventPipeline } from "./event-pipeline.js";
import { spanIdOf } from "./event-store-consumer.js";
import { methodSignature } from "./method-signature.js";
import type { NarrativeContext } from "./narrative-context.js";
import type { ParameterCapture } from "./parameter-capture.js";
import type { RenderedValue } from "./rendered-value.js";
import type { ServiceIdentity } from "./service-identity.js";
import { type SpanContext, type SpanContextExtras, spanContext } from "./span-context.js";
import { generateSpanId, generateTraceId, type SpanId, type TraceId } from "./span-id-generator.js";
import type { EnterEvent, TraceEvent } from "./trace-event.js";
import { type TraceLoss, traceLoss } from "./trace-loss.js";
import { returned, type TraceOutcome, threw } from "./trace-outcome.js";
import type { TraceTree } from "./trace-tree.js";
import type { Traceparent } from "./traceparent.js";
import { buildTraceTree } from "./tree-builder.js";

const NOOP_SPAN_ID = "" as SpanId;

/**
 * Ceiling on the spans one context will take over from asynchronous children (the same ceiling in every
 * NarrativeTrace runtime).
 *
 * @remarks A request-scoped context is dropped whole by `reset()`, so the bound is not about its
 * memory. It exists for the context that never resets — a long-lived worker loop dispatching async
 * work for the life of the process — where an unbounded set is a genuine leak.
 */
const MAX_ADOPTED_SPANS = 10_000;

/**
 * Ceiling on the length of a live-child chain — how many simultaneously open async scopes, each
 * activated from a snapshot of the one before, are visible to a capture while open (B-198; the same
 * ceiling in every NarrativeTrace runtime).
 *
 * @remarks {@link SyncNarrativeContext.reportableSpanIds} and
 * {@link SyncNarrativeContext.liveChildSpanIds} recurse once per link, so the chain length is a
 * stack-depth budget on whichever caller reads it: the origin at capture, the worker at scope
 * close, the request at reset. One worker can hold any number of scopes open, so without this the
 * chain is as long as the host likes and the read overflows the host's own stack. Real nested
 * async hops are a handful deep.
 */
const MAX_LIVE_CHILD_DEPTH = 64;

/**
 * How many spans of finished roots on unowned contexts may wait, per pipeline, for a capture that
 * will probably never come before the oldest are released (B-211; the same
 * default in every NarrativeTrace runtime).
 *
 * @remarks The adoption ceiling's figure, for the same reason: it bounds the context that never
 * resets. A release pass brings the queue down to half of it, so the store scan that removes the
 * released events is paid once per that many spans, not once per root.
 */
const UNOWNED_SPAN_LIMIT = 10_000;

/**
 * What the release queue knows of one context — never the context itself, so a queued root keeps
 * neither its context nor that context's pipeline alive (B-211).
 *
 * @remarks Not a `WeakRef`: a `WeakRef` keeps its target alive until the current job ends, so a
 * synchronous loop that builds thousands of short-lived contexts would hold every one of them, and
 * every ring, at once.
 */
interface UnownedOwner {
  claimed: boolean;
  /** No longer live: its `run()` scope settled, or the collector reclaimed it. */
  ended: boolean;
  latest: UnownedSegment | null;
  /** Released roots the context has yet to forget; it does so the next time it is used. */
  released: (readonly SpanId[])[];
}

/** One finished root of an unowned context: the spans it made reportable, and its owner. */
interface UnownedSegment {
  readonly owner: UnownedOwner;
  readonly spanIds: readonly SpanId[];
}

/**
 * The release queue every context publishing to one pipeline shares, oldest root first.
 *
 * @remarks Per pipeline because the store is the pipeline's: the bound is on what the store keeps,
 * whichever context traced it — the Node context's default scope and its un-reset `run()` scopes
 * alike.
 */
interface UnownedQueue {
  limit: number;
  queued: number;
  segments: UnownedSegment[];
}

const unownedQueues = new WeakMap<EventPipeline, UnownedQueue>();

/** A collected context is no longer live: its latest queued root becomes releasable. */
const collectedContexts = new FinalizationRegistry<UnownedOwner>((owner) => {
  owner.ended = true;
});

/**
 * Takes the oldest queued roots off the queue until half the limit is left, and removes their
 * events from the store in one pass; each owner forgets its own the next time it is used.
 *
 * @remarks Dropped without release: a root whose context has been claimed since (its owner keeps
 * it until its reset). Kept: the latest root of a live context.
 */
function releaseOldest(queue: UnownedQueue, pipeline: EventPipeline): void {
  const released = new Set<SpanId>();
  const kept: UnownedSegment[] = [];
  let i = 0;
  for (; i < queue.segments.length && queue.queued > queue.limit / 2; i++) {
    const segment = queue.segments[i] as UnownedSegment;
    const { owner } = segment;
    if (owner.latest === segment && !owner.ended && !owner.claimed) kept.push(segment);
    else takeSegment(queue, segment, released);
  }
  queue.segments = [...kept, ...queue.segments.slice(i)];
  if (released.size === 0) return;
  pipeline.flush();
  pipeline.removeSpans?.(released);
}

/** Takes one root off the queue: released, unless its context has been claimed since. */
function takeSegment(queue: UnownedQueue, segment: UnownedSegment, released: Set<SpanId>): void {
  const { owner, spanIds } = segment;
  queue.queued -= spanIds.length;
  if (owner.claimed) return;
  owner.released.push(spanIds);
  for (const id of spanIds) released.add(id);
}

/** The release queue of `pipeline`, created on first use; `limit` is the test seam. */
function unownedQueueOf(pipeline: EventPipeline, limit: number | undefined): UnownedQueue {
  let queue = unownedQueues.get(pipeline);
  if (!queue) {
    queue = { limit: UNOWNED_SPAN_LIMIT, queued: 0, segments: [] };
    unownedQueues.set(pipeline, queue);
  }
  if (limit) queue.limit = limit;
  return queue;
}

// The core compiles without a DOM or Node lib; `console` is the one host global the diagnostic needs.
declare const console: { warn(message: string): void };

/** Whether the one-per-process depth-cap diagnostic has been written. */
let depthCapReported = false;

function reportDepthCapOnce(): void {
  if (depthCapReported) return;
  depthCapReported = true;
  console.warn(
    `[narrativetrace] async scopes nested over ${MAX_LIVE_CHILD_DEPTH} deep show in a capture only once closed (live-child depth cap)`,
  );
}

/**
 * The handle a context hands back when it registers a live asynchronous child, and the only way to
 * end that registration.
 *
 * INTENT: the registration is a weak reference to the child. The child is
 * held **weakly**: a worker whose scope never closes must not keep its origin's view of it alive,
 * and a collected child simply contributes nothing and frees its slot against the ceiling.
 *
 * @remarks {@link clear} is the collector's effect made testable — the same `WeakReference.clear()`
 * shape every NarrativeTrace runtime exposes — not a second lifetime mechanism.
 */
export class LiveChildRegistration {
  private ref: WeakRef<SyncNarrativeContext> | null;

  /** @param child the freshly activated child context to hold weakly. */
  constructor(child: SyncNarrativeContext) {
    this.ref = new WeakRef(child);
  }

  /** The registered child, or `undefined` once it has been collected or {@link clear}ed. */
  deref(): SyncNarrativeContext | undefined {
    return this.ref?.deref();
  }

  /** Drops the reference, exactly as the collector does to a child that died mid-scope. */
  clear(): void {
    this.ref = null;
  }
}

/**
 * Named settings for {@link SyncNarrativeContext}'s options-object constructor.
 *
 * @remarks `serviceName`, `serviceVersion` and `environment` build the {@link ServiceIdentity}; leave
 * `serviceName` unset and exported chapters read `unknown_service:node`.
 */
export interface SyncContextOptions {
  readonly serviceName?: string | undefined;
  readonly serviceVersion?: string | undefined;
  readonly environment?: string | undefined;
  readonly parentResolver?: (() => SpanId | undefined) | undefined;
  readonly pipeline?: EventPipeline | undefined;
  readonly rootParentOverride?: SpanId | null | undefined;
  readonly inheritedTraceId?: TraceId | undefined;
  readonly maxAdoptedSpans?: number | undefined;
  /**
   * Test seam: the unowned-retention limit of this context's pipeline (B-211), default `10_000`.
   * The limit belongs to the pipeline's release queue, so setting it on any context sets it for
   * every context publishing there.
   */
  readonly unownedSpanLimit?: number | undefined;
}

/** The settings both constructor forms reduce to. */
interface ContextSettings {
  readonly parentResolver?: (() => SpanId | undefined) | undefined;
  readonly pipeline?: EventPipeline | undefined;
  readonly rootParentOverride?: SpanId | null | undefined;
  readonly serviceIdentity?: ServiceIdentity | undefined;
  readonly inheritedTraceId?: TraceId | undefined;
  readonly maxAdoptedSpans?: number | undefined;
  readonly unownedSpanLimit?: number | undefined;
}

/** The positional constructor's arguments after `parentResolver`, in order. */
type PositionalTail = [
  pipeline?: EventPipeline,
  rootParentOverride?: SpanId | null,
  serviceIdentity?: ServiceIdentity,
  inheritedTraceId?: TraceId,
  maxAdoptedSpans?: number,
];

function settingsFrom(
  second: SyncContextOptions | (() => SpanId | undefined) | undefined,
  tail: PositionalTail,
): ContextSettings {
  if (typeof second === "object") return settingsFromOptions(second);
  const [pipeline, rootParentOverride, serviceIdentity, inheritedTraceId, maxAdoptedSpans] = tail;
  return {
    parentResolver: second,
    pipeline,
    rootParentOverride,
    serviceIdentity,
    inheritedTraceId,
    maxAdoptedSpans,
  };
}

function settingsFromOptions(options: SyncContextOptions): ContextSettings {
  const { serviceName, serviceVersion, environment, ...settings } = options;
  const named: ServiceIdentity = {
    ...(serviceName !== undefined && { serviceName }),
    ...(serviceVersion !== undefined && { serviceVersion }),
    ...(environment !== undefined && { environment }),
  };
  const hasIdentity = Object.keys(named).length > 0;
  return { ...settings, serviceIdentity: hasIdentity ? named : undefined };
}

/**
 * The synchronous, single-trace {@link NarrativeContext} implementation.
 *
 * INTENT: the default runtime context. Maintains an explicit active-span stack, resolves
 * parent/child relationships, publishes enter/exit events to an {@link EventPipeline}, and builds
 * the {@link TraceTree} on demand. The first root method entered names the story/chapter.
 *
 * @remarks Fail-safe posture: at level `off` all hooks short-circuit and event delivery is
 * exception-isolated by the pipeline, so a broken listener never breaks the traced call.
 * `reset()`/request cleanup drop only this context's own spans, leaving other in-flight traces
 * sharing the pipeline untouched.
 *
 * A context nothing owns has its spans released in bounded batches (B-211). Owned means a
 * capture-facing call has claimed it — `reset()`, `captureTrace()`, `traceLoss()`, request or user
 * metadata, an inherited trace id (the inbound traceparent of a `run()`) — or it runs handed-over
 * work (a fork member, a nested `run()` scope, an activated snapshot), which its origin reports.
 * The claim outlives `reset()`. On an unowned context — an app-lifetime context nobody captures, the
 * Node context's process-wide default scope, a top-level `run()` that never resets — each root
 * that ends is queued and the next root starts a fresh trace; once more than 10 000 such spans
 * are queued on one pipeline the oldest roots are removed from their context and the store and
 * counted as refused on that context. The latest root of a live context is never released, so a
 * context that captures before it ever claimed still sees its last root whole. Live means not yet
 * collected (the queue never holds a context; a `FinalizationRegistry` marks one the collector
 * reclaimed) and, for a context backing a `run()` scope, not yet settled ({@link endScope}).
 * @example
 * ```ts
 * const context = new SyncNarrativeContext(new NarrativeTraceConfig());
 * const traced = traceObject(orderService, context);
 * traced.placeOrder("C1", "P1", 2);
 * const tree = context.captureTrace();
 * ```
 */
export class SyncNarrativeContext implements NarrativeContext {
  readonly config: NarrativeTraceConfig;
  readonly eventPipeline: EventPipeline;
  private readonly activeStack: SpanId[] = [];
  private readonly parentResolver: (() => SpanId | undefined) | null;
  private readonly parentMap = new Map<SpanId, SpanId | null>();
  private readonly spanContextMap = new Map<SpanId, SpanContext>();
  private _traceId: TraceId | null = null;
  private readonly serviceIdentity: ServiceIdentity | undefined;
  private snapshotParentSpanId: SpanId | null = null;
  private requestExtras: SpanContextExtras = {};
  private _storyId: string | null = null;
  private _chapterId: string | null = null;
  private adoptedSpanIds: Set<SpanId> | null = null;
  private liveChildren: Set<LiveChildRegistration> | null = null;
  /**
   * How many live-registration links lie above this context: 0 for one nobody registered, its
   * origin's depth + 1 for one {@link registerLiveChild} was asked to take — refused or not, so
   * everything below a refused link is refused too.
   */
  private _liveDepth = 0;
  private _refusedScopes = 0;
  private _refusedSpans = 0;
  private _fromSnapshot = false;
  private _generation = 0;
  /** Its claim, liveness and released roots, as the release queue sees them (B-211). */
  private readonly owner: UnownedOwner = {
    claimed: false,
    ended: false,
    latest: null,
    released: [],
  };
  /** Spans this unowned context made reportable since its last root ended. */
  private openSegment: SpanId[] = [];
  /** Whether this unowned context's next root starts a new trace. */
  private freshTracePending = false;
  private readonly unowned: UnownedQueue;

  private readonly rootParentOverride: SpanId | null;
  private readonly maxAdoptedSpans: number;

  /** Ceiling on a live-child chain's length (B-198); see the module constant. */
  static readonly MAX_LIVE_CHILD_DEPTH = MAX_LIVE_CHILD_DEPTH;

  /**
   * @param config the tracing level and policy.
   * @param options the same settings by name; prefer this form — `serviceName`, `serviceVersion` and
   * `environment` are what the platform and the OTel bridge show to someone else.
   */
  constructor(config: NarrativeTraceConfig, options?: SyncContextOptions);
  /** Positional form, kept for compatibility; the options-object overload takes the same settings. */
  constructor(
    config: NarrativeTraceConfig,
    parentResolver?: () => SpanId | undefined,
    pipeline?: EventPipeline,
    rootParentOverride?: SpanId | null,
    serviceIdentity?: ServiceIdentity,
    inheritedTraceId?: TraceId,
    maxAdoptedSpans?: number,
  );
  constructor(
    config: NarrativeTraceConfig,
    second?: SyncContextOptions | (() => SpanId | undefined),
    ...positionalTail: PositionalTail
  ) {
    const o = settingsFrom(second, positionalTail);
    this.config = config;
    this.parentResolver = o.parentResolver ?? null;
    this.eventPipeline = o.pipeline ?? new DualPathPipeline(null, new BufferedEventConsumer());
    this.serviceIdentity = o.serviceIdentity;
    this.rootParentOverride = o.rootParentOverride ?? null;
    this.maxAdoptedSpans = o.maxAdoptedSpans ?? MAX_ADOPTED_SPANS;
    this.unowned = unownedQueueOf(this.eventPipeline, o.unownedSpanLimit);
    // An inherited trace id is an adopted traceparent or a handed-over lineage: both are owned.
    if (o.inheritedTraceId) {
      this._traceId = o.inheritedTraceId;
      this.owner.claimed = true;
    }
  }

  get isActive(): boolean {
    return this.config.level !== "off";
  }

  get capturesParameterValues(): boolean {
    return this.config.level === "detail";
  }

  get activeSpanId(): SpanId | null {
    return this.activeStack[this.activeStack.length - 1] ?? null;
  }

  get storyId(): string | null {
    return this._storyId;
  }

  get chapterId(): string | null {
    return this._chapterId;
  }

  get currentTraceId(): TraceId | null {
    return this._traceId;
  }

  /**
   * The current trace id, generated if absent.
   *
   * @remarks Between two roots on an unowned context this continues the trace that just ended, and
   * the next root keeps it: the caller is asking for the identity of the work at hand (a log
   * correlation value, a propagation header). A context that wants a fresh trace per unit of work
   * claims an owner with {@link reset} between them, as the integrations do (B-211).
   */
  traceId(): TraceId {
    this.freshTracePending = false;
    this._traceId ??= generateTraceId();
    return this._traceId;
  }

  setRequestContext(httpMethod: string, httpRoute: HttpRoute, clientIp: ClientIp): void {
    this.claim();
    this.requestExtras = {
      ...this.requestExtras,
      httpMethod,
      httpRoute,
      clientIp,
    };
  }

  setUserContext(enduserId?: EnduserId, sessionId?: SessionId, tenantId?: TenantId): void {
    this.claim();
    this.requestExtras = {
      ...this.requestExtras,
      ...(enduserId !== undefined && { enduserId }),
      ...(sessionId !== undefined && { sessionId }),
      ...(tenantId !== undefined && { tenantId }),
    };
  }

  knownSpanIds(): ReadonlySet<SpanId> {
    return new Set(this.parentMap.keys());
  }

  /**
   * Everything this context can answer for right now: the spans it opened itself, the ones already
   * handed over by finished asynchronous children, and everything its live children can answer for.
   *
   * @remarks One definition serves both directions — a live child is read through it and a closing
   * scope hands exactly it over — so a call can never be visible while a scope is open and absent
   * once it closes. The recursion cannot cycle: a live child is always a context registered with
   * one origin at activation, so the registry is a forest with no back edge. Its depth is NOT
   * bounded by live workers — one worker can hold any number of scopes open, each activated from
   * the one before — it is bounded by {@link registerLiveChild}: no registered chain is longer than
   * {@link MAX_LIVE_CHILD_DEPTH}, so this recursion is at most that deep from any context, for
   * every reader (capture, hand-over at close, reset).
   */
  reportableSpanIds(): Set<SpanId> {
    const ids = new Set(this.parentMap.keys());
    for (const id of this.adoptedSpanIds ?? []) ids.add(id);
    for (const id of this.liveChildSpanIds()) ids.add(id);
    return ids;
  }

  /**
   * What every live child can answer for, transitively, pruning registrations whose child has been
   * collected — a chain of async hops reaches the origin whole instead of stopping one hop short.
   */
  liveChildSpanIds(): Set<SpanId> {
    const ids = new Set<SpanId>();
    const children = this.liveChildren;
    if (!children) return ids;
    for (const registration of children) {
      const child = registration.deref();
      if (child === undefined) children.delete(registration);
      else for (const id of child.reportableSpanIds()) ids.add(id);
    }
    return ids;
  }

  /**
   * Takes over the spans an asynchronous child published under a snapshot of this context.
   *
   * @remarks All-or-nothing by design: a batch that would cross {@link MAX_ADOPTED_SPANS} is
   * refused whole and counted in {@link traceLoss}. Adopting a prefix would strand children whose
   * parent stayed out, and the tree builder promotes a parentless node to a root — so the artifact
   * would assert a call graph that never happened, differently on every run. An incomplete trace is
   * honest; a wrong-shaped one is not.
   * @param spanIds the child's whole reportable set; an empty batch is a no-op.
   */
  adopt(spanIds: ReadonlySet<SpanId>): void {
    if (spanIds.size === 0) return;
    this.adoptedSpanIds ??= new Set();
    const adopted = this.adoptedSpanIds;
    if (adopted.size + spanIds.size > this.maxAdoptedSpans) {
      this._refusedScopes += 1;
      this._refusedSpans += spanIds.size;
      // Nobody will ever report a refused batch, so its events must not linger in the shared
      // pipeline forever. Not double-counted: the refusal is already reflected in refusedSpans.
      // Flushed first: a just-published event can still be sitting in the ring, unreachable to
      // removeSpans until it drains to the store.
      this.eventPipeline.flush();
      this.eventPipeline.removeSpans?.(spanIds);
      return;
    }
    for (const id of spanIds) adopted.add(id);
    // What an unowned root's children handed over leaves with that root (B-211).
    if (this.unclaimed()) this.openSegment.push(...spanIds);
  }

  /**
   * Discards this context's own reportable spans because the request that could have reported
   * them has already ended — the origin of an asynchronous scope was reset or collected before
   * this scope's work could hand itself over.
   *
   * @remarks Counted in {@link traceLoss}'s `discardedSpans`, distinct from a refused hand-over: a
   * refusal is a live request whose adoption ceiling was full; a discard is work whose request is
   * simply gone. Safe to call on a context nobody else references — it only touches the shared
   * pipeline's stored events, never this context's own (about-to-be-dropped) bookkeeping.
   */
  discardUnreportable(): void {
    this.eventPipeline.flush();
    this.eventPipeline.discardSpans?.(this.reportableSpanIds());
  }

  /** The spans already handed over by finished asynchronous children. */
  adoptedSpans(): ReadonlySet<SpanId> {
    return this.adoptedSpanIds ?? new Set<SpanId>();
  }

  /**
   * Publishes a child context to this one for the lifetime of its scope, so the child's spans are
   * reportable here from the moment they are published rather than only at scope close.
   *
   * @remarks Scope close is too late on its own: a framework routinely hands control back to the
   * caller while the scope is still open, so a capture racing the close would miss the work. Bounded
   * by the same ceiling as adoption, for the same reason — the context that never resets. A refused
   * registration loses nothing (the spans still arrive through {@link adopt} at close) and so is
   * not counted as a refusal.
   *
   * Bounded in depth too, by {@link MAX_LIVE_CHILD_DEPTH} (B-198): a child that would sit deeper
   * is refused on the same terms — visible at its scope's close instead of while open — and so is
   * everything activated below it, because it keeps the depth it was refused at. The first such
   * refusal in the process writes one `console.warn` line; nothing is thrown.
   * @param child the freshly activated child context; never this context.
   * @returns the handle to pass to {@link unregisterLiveChild}, or `null` when the ceiling refused.
   * @throws Error if `child` is missing, or is this context — no context is its own live child.
   */
  registerLiveChild(child: SyncNarrativeContext): LiveChildRegistration | null {
    if (!child) throw new Error("Child context is required");
    if (child === this) throw new Error("A context cannot be its own live child");
    const childDepth = this._liveDepth + 1;
    child._liveDepth = childDepth;
    if (childDepth > MAX_LIVE_CHILD_DEPTH) {
      reportDepthCapOnce();
      return null;
    }
    this.liveChildren ??= new Set();
    const children = this.liveChildren;
    if (children.size >= this.maxAdoptedSpans) return null;
    const registration = new LiveChildRegistration(child);
    children.add(registration);
    return registration;
  }

  /** This context's live-registration depth (test seam). */
  get liveDepth(): number {
    return this._liveDepth;
  }

  /** Ends a live registration. A `null` handle is a registration the ceiling refused. */
  unregisterLiveChild(registration: LiveChildRegistration | null): void {
    if (registration) this.liveChildren?.delete(registration);
  }

  /** Asynchronous scopes whose hand-over the adoption ceiling refused whole. */
  refusedScopeCount(): number {
    return this._refusedScopes;
  }

  /** Spans lost to those refusals — the number a reader of the trace is missing. */
  refusedSpanCount(): number {
    return this._refusedSpans;
  }

  /**
   * What this context's captured trace is missing, and why: events the buffer shed, the
   * asynchronous scopes and spans the adoption ceiling refused, plus spans discarded because their
   * request had already ended.
   *
   * @remarks Read it beside `captureTrace()` — a reader who is not told cannot tell an incomplete
   * narrative from a short one. `droppedEvents` and `discardedSpans` are the pipeline's counts and
   * so process-wide since the pipeline was created; the refusal counts belong to this context and
   * reset with it.
   */
  traceLoss(): TraceLoss {
    this.claim();
    return traceLoss(
      this.eventPipeline.droppedEventCount?.() ?? 0,
      this._refusedScopes,
      this._refusedSpans,
      this.eventPipeline.discardedSpanCount?.() ?? 0,
    );
  }

  enterMethod(
    className: string,
    methodName: string,
    params: readonly ParameterCapture[],
    options?: { narration?: string; errorContext?: string },
  ): SpanId {
    if (this.config.level === "off") return NOOP_SPAN_ID;
    const parentSpanId = this.resolveParent();
    // On an unowned context, async roots interleave: a child of a root that is still open keeps
    // that root's trace and story even after a later root started a fresh trace (B-211).
    const open =
      parentSpanId !== null && this.unclaimed() ? this.spanContextMap.get(parentSpanId) : undefined;
    this.beginTrace(parentSpanId);
    const spanId = generateSpanId();
    const sig = methodSignature(className, methodName, this.suppressIfNeeded(params), options);
    this.pushEnter(spanId, sig, parentSpanId, open);
    return spanId;
  }

  /**
   * Ensures a trace id for the span about to open: a new one when this is a root on an unowned
   * context whose previous root has ended (B-211), so unrelated units of work never share an id.
   */
  private beginTrace(parentSpanId: SpanId | null): void {
    if (parentSpanId === null && this.freshTracePending) {
      this.freshTracePending = false;
      this._traceId = this._storyId = this._chapterId = null;
    }
    this._traceId ??= generateTraceId();
  }

  private initStoryIfRoot(
    parentSpanId: SpanId | null,
    signature: ReturnType<typeof methodSignature>,
  ): void {
    if (parentSpanId === null && this._storyId === null) {
      const qualifiedName = `${signature.className}.${signature.methodName}`;
      this._storyId = qualifiedName;
      this._chapterId = qualifiedName;
    }
  }

  private buildExtras(): SpanContextExtras {
    return {
      ...this.requestExtras,
      ...(this._storyId !== null && { storyId: this._storyId }),
      ...(this._chapterId !== null && { chapterId: this._chapterId }),
    };
  }

  private pushEnter(
    spanId: SpanId,
    signature: ReturnType<typeof methodSignature>,
    parentSpanId: SpanId | null,
    open: SpanContext | undefined,
  ): void {
    this.initStoryIfRoot(parentSpanId, signature);
    const sc = spanContext(
      open?.traceId ?? this._traceId!,
      spanId,
      parentSpanId,
      this.serviceIdentity,
      open ?? this.buildExtras(),
    );
    this.eventPipeline.publish(this.enterEvent(sc, signature));
    this.parentMap.set(spanId, parentSpanId);
    this.spanContextMap.set(spanId, sc);
    this.activeStack.push(spanId);
    if (this.unclaimed()) this.openSegment.push(spanId);
  }

  private enterEvent(sc: SpanContext, signature: ReturnType<typeof methodSignature>): EnterEvent {
    const concurrency = this.asyncTag(signature);
    return {
      type: "enter",
      spanContext: sc,
      timestamp: performance.now(),
      signature,
      ...(concurrency && { concurrency }),
    };
  }

  /**
   * Tags the first span opened under an activated snapshot as `async` — and only that one, since
   * everything below it is ordinary sequential work in the same scope.
   *
   * @remarks This is what lets async work render the way fork members always have: under a marker,
   * members sorted, order not asserted. The scheduler decides which task starts first, so capture
   * order is not behaviour and a structural baseline must not pin it. The group is keyed by the
   * launching span so every async child of one call is one group; work propagated with no launching
   * span groups per trace instead.
   */
  private asyncTag(signature: ReturnType<typeof methodSignature>): ConcurrencyInfo | undefined {
    if (!this._fromSnapshot || this.activeStack.length > 0) return undefined;
    const key = this.snapshotParentSpanId ?? this._traceId;
    const label = `${signature.className}.${signature.methodName}`;
    return concurrencyInfo(`async-${key}`, label, "async");
  }

  exitMethodWithReturn(
    renderedValue: string | null,
    handle?: SpanId,
    structured?: RenderedValue,
  ): void {
    const sc = this.takeSpan(handle);
    if (sc) this.publishExit(sc, returned(renderedValue, structured));
  }

  exitMethodWithException(
    error: unknown,
    handle?: SpanId,
    errorContext: string | null = null,
  ): void {
    const sc = this.takeSpan(handle);
    if (sc) this.publishExit(sc, threw(error, errorContext));
  }

  /**
   * Resolves the span an exit closes and takes its context out of the map: nothing reads a span's
   * context once its exit is published (B-211), so a second exit of the same span publishes nothing.
   */
  private takeSpan(handle?: SpanId): SpanContext | undefined {
    if (this.config.level === "off") return undefined;
    const resolved = this.resolveSpanId(handle);
    if (resolved === undefined) return undefined;
    const sc = this.spanContextMap.get(resolved);
    this.spanContextMap.delete(resolved);
    return sc;
  }

  private publishExit(sc: SpanContext, outcome: TraceOutcome): void {
    this.eventPipeline.publish({
      type: "exit",
      spanContext: sc,
      timestamp: performance.now(),
      outcome,
    });
    this.releaseIfRootEnded();
  }

  /** Whether nothing owns this context: no claim, and no handed-over work running on it. */
  private unclaimed(): boolean {
    return !this.owner.claimed && !this._fromSnapshot;
  }

  /**
   * Records that this context's trace has an owner — something that captures or resets it — so
   * its spans are kept until that owner says otherwise, as before B-211.
   */
  private claim(): void {
    this.owner.claimed = true;
    this.openSegment = [];
    this.freshTracePending = false;
    this.forgetReleased();
  }

  /**
   * Marks the `run()` scope this context backs as settled.
   *
   * @remarks A settled scope is no longer live, so the release queue treats its latest unowned root
   * like any older one (B-211).
   */
  endScope(): void {
    this.owner.ended = true;
  }

  /**
   * Queues the root that just ended on an unowned context for release, and releases the oldest
   * queued roots once the pipeline's limit is crossed (B-211).
   *
   * INTENT: nothing will ever capture an unowned context's spans unless it later captures itself,
   * and nothing ever resets it — so without this every span it traced stayed in its maps and in
   * the store for the life of the process. Releasing at root exit would break the basic usage of
   * calling traced code and capturing afterwards, so the release is bounded rather than immediate.
   *
   * @remarks "Root ended" means no span is on the active stack and no scoped parent is open; an
   * async root still in flight is detached and is queued with the next root that ends here.
   */
  private releaseIfRootEnded(): void {
    const spanIds = this.openSegment;
    if (!this.unclaimed() || spanIds.length === 0 || !this.betweenRoots()) return;
    this.openSegment = [];
    this.freshTracePending = true;
    const owner = this.owner;
    const segment: UnownedSegment = { owner, spanIds };
    if (!owner.latest) collectedContexts.register(this, owner);
    owner.latest = segment;
    const queue = this.unowned;
    queue.segments.push(segment);
    queue.queued += spanIds.length;
    if (queue.queued > queue.limit) releaseOldest(queue, this.eventPipeline);
    this.forgetReleased();
  }

  /** No span on the active stack and no scoped parent open: the last root has ended. */
  private betweenRoots(): boolean {
    return this.activeStack.length === 0 && this.parentResolver?.() === undefined;
  }

  /**
   * Forgets the roots the release queue took from this context, counting them as refused on this
   * context only — a context that does capture later is told what it is missing, and no other is.
   */
  private forgetReleased(): void {
    const released = this.owner.released;
    if (released.length === 0) return;
    this.owner.released = [];
    for (const spanIds of released) {
      this._refusedSpans += spanIds.length;
      for (const id of spanIds) {
        this.parentMap.delete(id);
        this.spanContextMap.delete(id);
        this.adoptedSpanIds?.delete(id);
      }
    }
    this._refusedScopes += released.length;
  }

  detachFrame(handle: SpanId): void {
    const idx = this.activeStack.indexOf(handle);
    if (idx !== -1) this.activeStack.splice(idx, 1);
  }

  parentOf(handle: SpanId): SpanId | null {
    return this.parentMap.get(handle) ?? null;
  }

  run<T>(fn: () => T, _inherited?: TraceId | Traceparent): T {
    return fn();
  }

  runScoped<T>(_handle: SpanId, fn: () => T): T {
    return fn();
  }

  captureTrace(): TraceTree {
    this.claim();
    this.eventPipeline.flush();
    const reportable = this.reportableSpanIds();
    const filtered = this.eventPipeline.events().filter((e) => this.isOwned(e, reportable));
    // `currentTraceId`, never `traceId()`: an idle context must not acquire an identity merely by
    // being asked to capture. A context that traced nothing hands over none, and the empty tree
    // keeps none.
    return buildTraceTree(filtered, this.config.level, this._traceId ?? undefined);
  }

  private isOwned(event: TraceEvent, spanIds: Set<SpanId>): boolean {
    switch (event.type) {
      case "enter":
      case "exit":
        return spanIds.has(event.spanContext.spanId);
      case "fork-created":
      case "join-complete":
        return spanIds.has(spanIdOf(event) as SpanId);
    }
  }

  reset(): void {
    this.claim();
    this.cleanupOwnedEvents();
    this.activeStack.length = 0;
    this.parentMap.clear();
    this.spanContextMap.clear();
    this._traceId = null;
    this.snapshotParentSpanId = null;
    this.requestExtras = {};
    this._storyId = this._chapterId = null;
    // This runtime reuses the stack object across a reset, so everything the stack
    // carried — adoptions, live registrations and their refusal counts — is dropped by hand.
    this.adoptedSpanIds = null;
    this.liveChildren = null;
    this._liveDepth = 0;
    this._refusedScopes = 0;
    this._refusedSpans = 0;
    this._fromSnapshot = false;
    this._generation += 1;
  }

  // Request-scoped cleanup: drop only what this context could report — its own spans plus
  // whatever finished async children already handed over — so a finishing request cannot erase
  // events belonging to other in-flight traces sharing the pipeline (port of
  // ThreadLocalNarrativeContext.reset). Pipelines that cannot scope removal fall back to a full
  // clear. Deliberately excludes still-live children: their spans belong to a context object that
  // is still running and will report or discard them on its own (no-poison contract —
  // clearing only `parentMap` left every adopted worker span/event in the shared store forever).
  private cleanupOwnedEvents(): void {
    const reportableSpanIds = this.ownedAndAdoptedSpanIds();
    if (!this.eventPipeline.removeSpans) {
      this.eventPipeline.clear();
      return;
    }
    if (reportableSpanIds.size > 0) {
      this.eventPipeline.flush();
      this.eventPipeline.removeSpans(reportableSpanIds);
    }
  }

  private ownedAndAdoptedSpanIds(): Set<SpanId> {
    const ids = new Set(this.parentMap.keys());
    for (const id of this.adoptedSpanIds ?? []) ids.add(id);
    return ids;
  }

  inheritRequestExtras(source: SyncNarrativeContext): void {
    this.requestExtras = { ...source.requestExtras };
  }

  /** A copy of the request/user metadata for propagation to forked/background children. */
  exportRequestExtras(): SpanContextExtras {
    return { ...this.requestExtras };
  }

  applyRequestExtras(extras: SpanContextExtras): void {
    this.requestExtras = { ...this.requestExtras, ...extras };
  }

  setSnapshotParent(parentSpanId: SpanId, traceId: TraceId): void {
    this.snapshotParentSpanId = parentSpanId;
    if (!this._traceId) this._traceId = traceId;
  }

  /**
   * Adopts a snapshot's captured lineage onto this context for the duration of a scope.
   *
   * @remarks A `null` parent span is the parentless case, not an error: work submitted after the
   * launching call returned joins the same trace as its next root. The trace id is taken whenever
   * the snapshot carries one, which is what makes that case join at all.
   * @param traceId the trace the snapshot belongs to, or `null` if it had none yet.
   * @param parentSpanId the span open when the snapshot was taken, or `null` if none was.
   * @param crossesBoundary whether this activation is an asynchronous hop rather than a plain scope
   * on the context that took the snapshot; only a hop marks the context as snapshot-run.
   */
  applySnapshot(
    traceId: TraceId | null,
    parentSpanId: SpanId | null,
    crossesBoundary = true,
  ): void {
    if (traceId) this._traceId = traceId;
    if (parentSpanId) this.snapshotParentSpanId = parentSpanId;
    if (crossesBoundary) this._fromSnapshot = true;
  }

  /** True while this context is running work activated from another context's snapshot. */
  get isFromSnapshot(): boolean {
    return this._fromSnapshot;
  }

  /**
   * How many times this context has been {@link reset}.
   *
   * @remarks This runtime reuses the stack object on reset, so a snapshot taken before it does not
   * find its origin gone; the generation is what tells a snapshot that
   * the request it belongs to is over — without it a late worker would graft its spans onto whatever
   * request is using the context now.
   */
  get generation(): number {
    return this._generation;
  }

  /**
   * Opens a scope on this context, returning the handle that rolls its stack, trace identity and
   * snapshot lineage back to what they were.
   *
   * @remarks Idempotent: closing twice restores once, so a `finally` that races an explicit close
   * cannot rewind past the saved point.
   */
  beginScope(): ContextScope {
    const savedLength = this.activeStack.length;
    const savedTraceId = this._traceId;
    const savedSnapshotParent = this.snapshotParentSpanId;
    const savedFromSnapshot = this._fromSnapshot;
    let closed = false;
    return {
      close: () => {
        if (closed) return;
        closed = true;
        this.activeStack.length = savedLength;
        this._traceId = savedTraceId;
        this.snapshotParentSpanId = savedSnapshotParent;
        this._fromSnapshot = savedFromSnapshot;
      },
    };
  }

  private resolveParent(): SpanId | null {
    const external = this.parentResolver?.() ?? undefined;
    if (external !== undefined) return external;
    const stackTop = this.activeStack[this.activeStack.length - 1];
    if (stackTop !== undefined) return stackTop;
    if (this.snapshotParentSpanId !== null) return this.snapshotParentSpanId;
    return this.rootParentOverride;
  }

  private resolveSpanId(explicit?: SpanId): SpanId | undefined {
    if (explicit !== undefined && explicit !== NOOP_SPAN_ID) {
      const idx = this.activeStack.indexOf(explicit);
      if (idx !== -1) this.activeStack.splice(idx, 1);
      return explicit;
    }
    return this.activeStack.pop();
  }

  snapshot(): ContextSnapshot {
    // The workers belong with the root at hand: an unowned context's trace continues (B-211).
    this.freshTracePending = false;
    // Weak by construction: a pending snapshot must never keep a finished request's context alive,
    // and an origin that is gone adopts nothing. Nothing below may close over `this` — a strong
    // capture here would reintroduce exactly the leak the weak handle exists to prevent.
    return snapshotOf(new WeakRef(this), {
      traceId: this._traceId,
      parentSpanId: this.activeSpanId,
      generation: this._generation,
    });
  }

  private suppressIfNeeded(params: readonly ParameterCapture[]): readonly ParameterCapture[] {
    if (this.config.level === "detail") return params;
    return params.map((p) => ({
      name: p.name,
      renderedValue: "",
      redacted: p.redacted,
    }));
  }
}

/** The lineage a snapshot carries across the asynchronous boundary, read at snapshot time. */
interface CapturedLineage {
  readonly traceId: TraceId | null;
  readonly parentSpanId: SpanId | null;
  /** The origin's {@link SyncNarrativeContext.generation} when the snapshot was taken. */
  readonly generation: number;
}

const CLOSED_SCOPE: ContextScope = { close: () => {} };

/**
 * The origin context if it is still the one that took the snapshot, otherwise `undefined`.
 *
 * @remarks Two ways to be gone: collected (the weak handle is empty) or reset (the request it
 * belonged to ended and the generation moved on). Both mean the same thing to a late worker —
 * register with nobody, hand over to nobody, resurrect nothing.
 */
function liveOrigin(
  origin: WeakRef<SyncNarrativeContext>,
  generation: number,
): SyncNarrativeContext | undefined {
  const context = origin.deref();
  return context && context.generation === generation ? context : undefined;
}

/**
 * Builds the snapshot handle, module-level rather than a method so nothing it closes over can hold
 * the origin context strongly and defeat the weak handle.
 */
function snapshotOf(
  origin: WeakRef<SyncNarrativeContext>,
  captured: CapturedLineage,
): ContextSnapshot {
  return {
    activate: (context: NarrativeContext) => activateSnapshot(origin, context, captured, true),
    activateWithoutAdoption: (context: NarrativeContext) =>
      activateSnapshot(origin, context, captured, false),
    wrapFn: <T>(context: NarrativeContext, fn: () => T): T => {
      const scope = activateSnapshot(origin, context, captured, true);
      try {
        return fn();
      } finally {
        scope.close();
      }
    },
  };
}

/**
 * Activates a snapshot on `context`, registering it as the origin's live child for the scope.
 *
 * @remarks Activating on the origin itself is a plain scope, not an asynchronous hop: there is no
 * second party to register with, nothing to hand back, and no boundary to tag. `adopting` is false
 * for helpers that publish their own children — they register nothing and hand nothing over.
 */
function activateSnapshot(
  origin: WeakRef<SyncNarrativeContext>,
  context: NarrativeContext,
  captured: CapturedLineage,
  adopting: boolean,
): ContextScope {
  const originContext = liveOrigin(origin, captured.generation);
  const target = context instanceof SyncNarrativeContext ? context : originContext;
  if (!target) return CLOSED_SCOPE;
  const child = target === originContext ? null : target;
  const scope = target.beginScope();
  target.applySnapshot(captured.traceId, captured.parentSpanId, child !== null);
  if (!child || !adopting) return scope;
  return adoptingScope(scope, origin, captured.generation, child);
}

/**
 * The scope of an adopting activation: register the child now, and on close restore the target and
 * hand the child's whole reportable set to the origin.
 */
function adoptingScope(
  scope: ContextScope,
  origin: WeakRef<SyncNarrativeContext>,
  generation: number,
  child: SyncNarrativeContext,
): ContextScope {
  const registration = liveOrigin(origin, generation)?.registerLiveChild(child) ?? null;
  return {
    close: () => {
      scope.close();
      handOver(liveOrigin(origin, generation), child, registration);
    },
  };
}

/**
 * Hands the child's whole reportable set to the origin, then drops the live registration — in that
 * order, so a capture racing the close sees the work through one route or the other, never neither.
 *
 * @remarks When the origin is gone (reset, or the request finished) there is no request left to
 * hand the work to — an orphan must not resurrect it. The child's spans/events must not simply
 * rot in the shared pipeline either (no-poison contract): they are discarded and
 * counted as loss instead, exactly as a worker's late completion after `reset()` is.
 */
function handOver(
  originContext: SyncNarrativeContext | undefined,
  child: SyncNarrativeContext,
  registration: LiveChildRegistration | null,
): void {
  if (!originContext) {
    child.discardUnreportable();
    return;
  }
  originContext.adopt(child.reportableSpanIds());
  originContext.unregisterLiveChild(registration);
}
