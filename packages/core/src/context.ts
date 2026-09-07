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
import { methodSignature } from "./method-signature.js";
import type { NarrativeContext } from "./narrative-context.js";
import type { ParameterCapture } from "./parameter-capture.js";
import type { RenderedValue } from "./rendered-value.js";
import type { ServiceIdentity } from "./service-identity.js";
import { type SpanContext, type SpanContextExtras, spanContext } from "./span-context.js";
import { generateSpanId, generateTraceId, type SpanId, type TraceId } from "./span-id-generator.js";
import type { EnterEvent, TraceEvent } from "./trace-event.js";
import { type TraceLoss, traceLoss } from "./trace-loss.js";
import { returned, threw } from "./trace-outcome.js";
import type { TraceTree } from "./trace-tree.js";
import { buildTraceTree } from "./tree-builder.js";

const NOOP_SPAN_ID = "" as SpanId;

/**
 * Ceiling on the spans one context will take over from asynchronous children (Java parity:
 * `TraceStack.MAX_ADOPTED_SPANS`).
 *
 * @remarks A request-scoped context is dropped whole by `reset()`, so the bound is not about its
 * memory. It exists for the context that never resets — a long-lived worker loop dispatching async
 * work for the life of the process — where an unbounded set is a genuine leak.
 */
const MAX_ADOPTED_SPANS = 10_000;

/**
 * The handle a context hands back when it registers a live asynchronous child, and the only way to
 * end that registration.
 *
 * INTENT: mirrors the `WeakReference` Java's `TraceStack.registerLiveChild` returns. The child is
 * held **weakly**: a worker whose scope never closes must not keep its origin's view of it alive,
 * and a collected child simply contributes nothing and frees its slot against the ceiling.
 *
 * @remarks {@link clear} is the collector's effect made testable — the same `WeakReference.clear()`
 * the Java runtime exposes — not a second lifetime mechanism.
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
  private _refusedScopes = 0;
  private _refusedSpans = 0;
  private _fromSnapshot = false;
  private _generation = 0;

  constructor(
    config: NarrativeTraceConfig,
    parentResolver?: () => SpanId | undefined,
    pipeline?: EventPipeline,
    private readonly rootParentOverride: SpanId | null = null,
    serviceIdentity?: ServiceIdentity,
    inheritedTraceId?: TraceId,
    private readonly maxAdoptedSpans: number = MAX_ADOPTED_SPANS,
  ) {
    this.config = config;
    this.parentResolver = parentResolver ?? null;
    this.eventPipeline = pipeline ?? new DualPathPipeline(null, new BufferedEventConsumer());
    this.serviceIdentity = serviceIdentity;
    if (inheritedTraceId) this._traceId = inheritedTraceId;
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

  traceId(): TraceId {
    if (!this._traceId) this._traceId = generateTraceId();
    return this._traceId;
  }

  setRequestContext(httpMethod: string, httpRoute: HttpRoute, clientIp: ClientIp): void {
    this.requestExtras = {
      ...this.requestExtras,
      httpMethod,
      httpRoute,
      clientIp,
    };
  }

  setUserContext(enduserId?: EnduserId, sessionId?: SessionId, tenantId?: TenantId): void {
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
   * one origin at activation, so the registry is a forest with no back edge.
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
   * @param child the freshly activated child context; never this context.
   * @returns the handle to pass to {@link unregisterLiveChild}, or `null` when the ceiling refused.
   * @throws Error if `child` is missing, or is this context — no context is its own live child.
   */
  registerLiveChild(child: SyncNarrativeContext): LiveChildRegistration | null {
    if (!child) throw new Error("Child context is required");
    if (child === this) throw new Error("A context cannot be its own live child");
    this.liveChildren ??= new Set();
    const children = this.liveChildren;
    if (children.size >= this.maxAdoptedSpans) return null;
    const registration = new LiveChildRegistration(child);
    children.add(registration);
    return registration;
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
    this.traceId();
    const spanId = generateSpanId();
    const sig = methodSignature(className, methodName, this.suppressIfNeeded(params), options);
    this.pushEnter(spanId, sig);
    return spanId;
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

  private pushEnter(spanId: SpanId, signature: ReturnType<typeof methodSignature>): void {
    const parentSpanId = this.resolveParent();
    this.initStoryIfRoot(parentSpanId, signature);
    const sc = spanContext(
      this._traceId!,
      spanId,
      parentSpanId,
      this.serviceIdentity,
      this.buildExtras(),
    );
    this.eventPipeline.publish(this.enterEvent(sc, signature));
    this.parentMap.set(spanId, parentSpanId);
    this.spanContextMap.set(spanId, sc);
    this.activeStack.push(spanId);
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
    if (this.config.level === "off") return;
    const resolved = this.resolveSpanId(handle);
    if (resolved === undefined) return;
    const sc = this.spanContextMap.get(resolved);
    if (!sc) return;
    this.eventPipeline.publish({
      type: "exit",
      spanContext: sc,
      timestamp: performance.now(),
      outcome: returned(renderedValue, structured),
    });
  }

  exitMethodWithException(
    error: unknown,
    handle?: SpanId,
    errorContext: string | null = null,
  ): void {
    if (this.config.level === "off") return;
    const resolved = this.resolveSpanId(handle);
    if (resolved === undefined) return;
    const sc = this.spanContextMap.get(resolved);
    if (!sc) return;
    this.eventPipeline.publish({
      type: "exit",
      spanContext: sc,
      timestamp: performance.now(),
      outcome: threw(error, errorContext),
    });
  }

  detachFrame(handle: SpanId): void {
    const idx = this.activeStack.indexOf(handle);
    if (idx !== -1) this.activeStack.splice(idx, 1);
  }

  parentOf(handle: SpanId): SpanId | null {
    return this.parentMap.get(handle) ?? null;
  }

  run<T>(fn: () => T, _inheritedTraceId?: TraceId): T {
    return fn();
  }

  runScoped<T>(_handle: SpanId, fn: () => T): T {
    return fn();
  }

  captureTrace(): TraceTree {
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
        return spanIds.has(event.parentSpanId as SpanId);
      case "join-complete":
        return false;
    }
  }

  reset(): void {
    this.cleanupOwnedEvents();
    this.activeStack.length = 0;
    this.parentMap.clear();
    this.spanContextMap.clear();
    this._traceId = null;
    this.snapshotParentSpanId = null;
    this.requestExtras = {};
    this._storyId = null;
    this._chapterId = null;
    // Java drops the whole TraceStack here; this runtime reuses the object, so everything the stack
    // carried — adoptions, live registrations and their refusal counts — is dropped by hand.
    this.adoptedSpanIds = null;
    this.liveChildren = null;
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
   * @remarks Java drops the whole `TraceStack` on reset, so a snapshot taken before it simply finds
   * its origin gone. This runtime reuses the object, so the generation is what tells a snapshot that
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
 * counted as loss instead, exactly as a Java worker's late completion after `reset()` now is.
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
