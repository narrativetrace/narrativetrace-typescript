// SPDX-License-Identifier: BUSL-1.1
// Licensed under the Business Source License 1.1 (see LICENSE); Change Date: four years from publication; Change License: Apache-2.0
// Copyright (c) 2026 Empower Agile
import { AsyncLocalStorage } from "node:async_hooks";
import type {
  ClientIp,
  EnduserId,
  EventPipeline,
  HttpRoute,
  NarrativeContext,
  ParameterCapture,
  RenderedValue,
  ServiceIdentity,
  SessionId,
  TenantId,
  TraceLoss,
  TraceTree,
} from "@narrativetrace/core";
import {
  BufferedEventConsumer,
  DualPathPipeline,
  isThenable,
  type NarrativeTraceConfig,
  type SpanId,
  SyncNarrativeContext,
  type TraceId,
} from "@narrativetrace/core";

export class AsyncNarrativeContext implements NarrativeContext {
  private readonly storage = new AsyncLocalStorage<SyncNarrativeContext>();
  private readonly scopeStorage = new AsyncLocalStorage<SpanId>();
  private readonly defaultContext: SyncNarrativeContext;
  readonly config: NarrativeTraceConfig;
  readonly eventPipeline: EventPipeline;
  private readonly serviceIdentity: ServiceIdentity | undefined;

  constructor(
    config: NarrativeTraceConfig,
    pipeline?: EventPipeline,
    serviceIdentity?: ServiceIdentity,
  ) {
    this.config = config;
    this.eventPipeline = pipeline ?? new DualPathPipeline(null, new BufferedEventConsumer());
    this.serviceIdentity = serviceIdentity;
    this.defaultContext = new SyncNarrativeContext(
      config,
      () => this.scopeStorage.getStore(),
      this.eventPipeline,
      null,
      serviceIdentity,
    );
  }

  get isActive(): boolean {
    return this.config.level !== "off";
  }

  get capturesParameterValues(): boolean {
    return this.config.level === "detail";
  }

  get activeSpanId(): SpanId | null {
    return this.current().activeSpanId;
  }

  get storyId(): string | null {
    return this.current().storyId;
  }

  get chapterId(): string | null {
    return this.current().chapterId;
  }

  enterMethod(
    className: string,
    methodName: string,
    params: readonly ParameterCapture[],
    options?: { narration?: string; errorContext?: string },
  ): SpanId {
    return this.current().enterMethod(className, methodName, params, options);
  }

  exitMethodWithReturn(
    renderedValue: string | null,
    handle?: SpanId,
    structured?: RenderedValue,
  ): void {
    this.current().exitMethodWithReturn(renderedValue, handle, structured);
  }

  exitMethodWithException(error: unknown, handle?: SpanId, errorContext?: string | null): void {
    this.current().exitMethodWithException(error, handle, errorContext);
  }

  detachFrame(handle: SpanId): void {
    this.current().detachFrame(handle);
  }

  parentOf(handle: SpanId): SpanId | null {
    return this.current().parentOf(handle);
  }

  captureTrace(): TraceTree {
    return this.current().captureTrace();
  }

  /** What the current scope's captured trace is missing, and why. */
  traceLoss(): TraceLoss {
    return this.current().traceLoss();
  }

  reset(): void {
    this.current().reset();
  }

  traceId(): TraceId {
    return this.current().traceId();
  }

  setRequestContext(httpMethod: string, httpRoute: HttpRoute, clientIp: ClientIp): void {
    this.current().setRequestContext(httpMethod, httpRoute, clientIp);
  }

  setUserContext(enduserId?: EnduserId, sessionId?: SessionId, tenantId?: TenantId): void {
    this.current().setUserContext(enduserId, sessionId, tenantId);
  }

  /**
   * Runs `fn` in a fresh asynchronous scope of this context.
   *
   * @remarks Nested inside another scope, the new scope is **registered as that scope's live child**
   * and hands its whole reportable set back when `fn` settles, so work launched from a request is
   * reported by the request's capture — while it is still in flight, not only once it finishes. A
   * top-level scope has no parent to register with: it *is* the request, the analogue of Java's
   * per-request thread getting its own `TraceStack`.
   */
  run<T>(fn: () => T, inheritedTraceId?: TraceId): T {
    const parent = this.storage.getStore();
    const inner = this.childContext(parent, inheritedTraceId);
    const handOver = registerLiveChild(parent, inner);
    try {
      return settleWith(this.storage.run(inner, fn), handOver);
    } catch (error) {
      handOver();
      throw error;
    }
  }

  private childContext(
    parent: SyncNarrativeContext | undefined,
    inheritedTraceId?: TraceId,
  ): SyncNarrativeContext {
    const traceId = inheritedTraceId ?? parent?.currentTraceId ?? undefined;
    const inner = new SyncNarrativeContext(
      this.config,
      () => this.scopeStorage.getStore(),
      this.eventPipeline,
      null,
      this.serviceIdentity,
      traceId,
    );
    if (!parent) return inner;
    inner.inheritRequestExtras(parent);
    // A nested scope *is* the asynchronous hop, so it carries the lineage and the boundary mark
    // that tags its first span `async`. A top-level scope has crossed nothing.
    inner.applySnapshot(traceId ?? null, parent.activeSpanId);
    return inner;
  }

  runScoped<T>(handle: SpanId, fn: () => T): T {
    return this.scopeStorage.run(handle, fn);
  }

  exportRequestExtras(): ReturnType<SyncNarrativeContext["exportRequestExtras"]> {
    return this.current().exportRequestExtras();
  }

  /**
   * The context backing the current asynchronous scope.
   *
   * @remarks How `core`'s fork/fire-and-forget helpers reach the ledger they publish their own
   * children to, without `core` knowing anything about `AsyncLocalStorage`.
   */
  get activeScope(): SyncNarrativeContext {
    return this.current();
  }

  private current(): SyncNarrativeContext {
    return this.storage.getStore() ?? this.defaultContext;
  }
}

/**
 * Publishes `inner` to `parent` for the lifetime of the scope and returns the hand-over that ends
 * it: adopt the child's whole reportable set, then unregister — in that order, so a capture racing
 * the hand-over sees the work through one route or the other, never neither.
 *
 * @remarks Called exactly once per scope — when the scope's promise settles, when it returned
 * synchronously, or when it threw before {@link settleWith} could see a result.
 */
function registerLiveChild(
  parent: SyncNarrativeContext | undefined,
  inner: SyncNarrativeContext,
): () => void {
  if (!parent) return () => {};
  const registration = parent.registerLiveChild(inner);
  return () => {
    parent.adopt(inner.reportableSpanIds());
    parent.unregisterLiveChild(registration);
  };
}

/**
 * Runs `handOver` when `result` settles — immediately when the scope returned synchronously.
 *
 * @remarks A hostile thenable's own registration (a throwing `.then` accessor, or a `.then()` call
 * that throws) must not replace the value `fn()` actually produced — the original result still
 * wins, and `handOver` still runs exactly once (no-poison contract).
 */
function settleWith<T>(result: T, handOver: () => void): T {
  if (!isThenable(result)) {
    handOver();
    return result;
  }
  try {
    result.then(handOver, handOver);
  } catch {
    handOver();
  }
  return result;
}
