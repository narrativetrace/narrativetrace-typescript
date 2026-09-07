// SPDX-License-Identifier: BUSL-1.1
// Licensed under the Business Source License 1.1 (see LICENSE); Change Date: four years from publication; Change License: Apache-2.0
// Copyright (c) 2026 Empower Agile
import type { ClientIp, EnduserId, HttpRoute, SessionId, TenantId } from "./branded-types.js";
import type { ParameterCapture } from "./parameter-capture.js";
import type { RenderedValue } from "./rendered-value.js";
import type { SpanId, TraceId } from "./span-id-generator.js";
import type { TraceLoss } from "./trace-loss.js";
import type { TraceTree } from "./trace-tree.js";

/**
 * The per-trace capture surface: records method entry/exit events and assembles them into a
 * {@link TraceTree}. Proxies call these hooks around traced business methods.
 *
 * @remarks Layer: core capture contract — implemented by {@link SyncNarrativeContext} for real
 * capture and by {@link NOOP_CONTEXT} when tracing is off. Owns event capture and trace assembly;
 * does NOT own rendering.
 * @remarks Fail-safe posture: capture is observability, never application logic. Implementations
 * isolate their own failures so a traced call never fails because tracing did; when `isActive` is
 * false every method is a cheap no-op.
 */
export interface NarrativeContext {
  enterMethod(
    className: string,
    methodName: string,
    params: readonly ParameterCapture[],
    options?: { narration?: string; errorContext?: string },
  ): SpanId;
  exitMethodWithReturn(
    renderedValue: string | null,
    handle?: SpanId,
    structured?: RenderedValue,
  ): void;
  exitMethodWithException(error: unknown, handle?: SpanId, errorContext?: string | null): void;
  detachFrame(handle: SpanId): void;
  captureTrace(): TraceTree;
  /**
   * What the trace {@link captureTrace} just returned is missing, and why.
   *
   * Optional: only an implementation that can lose something reports a loss, and a context that
   * cannot says nothing rather than a misleading zero.
   */
  traceLoss?(): TraceLoss;
  reset(): void;
  runScoped<T>(handle: SpanId, fn: () => T): T;
  parentOf(handle: SpanId): SpanId | null;
  traceId(): TraceId;
  setRequestContext(httpMethod: string, httpRoute: HttpRoute, clientIp: ClientIp): void;
  setUserContext(enduserId?: EnduserId, sessionId?: SessionId, tenantId?: TenantId): void;
  run<T>(fn: () => T, inheritedTraceId?: TraceId): T;
  readonly isActive: boolean;
  /**
   * Performance hint: whether the context will retain rendered parameter values. When false
   * (OFF/SUMMARY/NARRATIVE) the proxy skips argument value rendering entirely rather than
   * rendering and then discarding it post-hoc.
   */
  readonly capturesParameterValues: boolean;
  readonly storyId: string | null;
  readonly chapterId: string | null;
}
