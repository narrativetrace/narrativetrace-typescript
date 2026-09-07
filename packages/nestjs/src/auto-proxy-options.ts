// SPDX-License-Identifier: BUSL-1.1
// Licensed under the Business Source License 1.1 (see LICENSE); Change Date: four years from publication; Change License: Apache-2.0
// Copyright (c) 2026 Empower Agile
import type {
  EnduserId,
  EventPipeline,
  NarrativeContext,
  SessionId,
  TenantId,
  TraceTree,
  TracingLevel,
} from "@narrativetrace/core";

export const NARRATIVE_OPTIONS = "NARRATIVE_OPTIONS";

/**
 * Capture-buffer size this seam gives each request's context: `8192` events.
 *
 * INTENT: a request is not a long-lived process. The runtime's `65536` default is sized for a
 * process absorbing production bursts over its whole lifetime, but `NarrativeInterceptor` builds a
 * *fresh* `SyncNarrativeContext` per request, and the ring is allocated whole on the first traced
 * call in it (measured ~99 µs against ~4 µs at this size — V8 moves a backing store over ~128 KB
 * into large-object space, and 8,192 pointers sits just under that cliff). Paying that per request
 * is the cost this default avoids; override with {@link AutoProxyOptions.bufferCapacity}.
 */
export const DEFAULT_NESTJS_BUFFER_CAPACITY = 8192;

export interface NestUserInfo {
  enduserId?: EnduserId;
  sessionId?: SessionId;
  tenantId?: TenantId;
}

export interface NestRequestCompletion {
  readonly statusCode: number;
  readonly durationMs: number;
  readonly tree: TraceTree;
}

export interface AutoProxyOptions {
  readonly serviceName?: string;
  readonly serviceVersion?: string;
  readonly environment?: string;
  readonly level?: TracingLevel;
  // biome-ignore lint/complexity/noBannedTypes: NestJS metatypes are Function references
  readonly exclude?: Function[];
  /**
   * Event pipeline the per-request context publishes into. Without this, spans are captured into a
   * throwaway consumer that nothing drains (the TS-DI-1 dead-end); pass a DualPathBuilt pipeline
   * (e.g. wired to a pino/winston/otel consumer) to actually export traces. Supplying this makes
   * {@link bufferCapacity} moot — sizing the ring is then the caller's job.
   */
  readonly pipeline?: EventPipeline;
  /**
   * Capture-buffer size for each request's context, default
   * {@link DEFAULT_NESTJS_BUFFER_CAPACITY}. Ignored when {@link pipeline} is supplied.
   */
  readonly bufferCapacity?: number;
  /** Fires after each request with the captured tree, HTTP status, and duration. */
  readonly onRequestComplete?: (ctx: NarrativeContext, completion: NestRequestCompletion) => void;
  /** Optional per-request user identity extractor, stamped onto spans. */
  readonly extractUser?: (req: unknown) => NestUserInfo | undefined;
  /** Reserved for log-consumer naming parity with Java's loggerName. */
  readonly loggerName?: string;
}
