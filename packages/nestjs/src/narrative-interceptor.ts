// SPDX-License-Identifier: BUSL-1.1
// Licensed under the Business Source License 1.1 (see LICENSE); Change Date: four years from publication; Change License: Apache-2.0
// Copyright (c) 2026 Empower Agile
import {
  BufferedEventConsumer,
  type ClientIp,
  DualPathPipeline,
  type EventPipeline,
  type HttpRoute,
  NarrativeTraceConfig,
  parseTraceparent,
  type ServiceIdentity,
  SyncNarrativeContext,
  type TraceId,
} from "@narrativetrace/core";
import {
  buildRequestLogValues,
  buildUserLogValues,
  LogContext,
} from "@narrativetrace/observability";
import type { CallHandler, ExecutionContext, NestInterceptor } from "@nestjs/common";
import { Inject, Injectable } from "@nestjs/common";
import { Observable } from "rxjs";
import { finalize } from "rxjs/operators";
import {
  type AutoProxyOptions,
  DEFAULT_NESTJS_BUFFER_CAPACITY,
  NARRATIVE_OPTIONS,
} from "./auto-proxy-options.js";
import { NarrativeStorage } from "./narrative-storage.js";

function buildIdentity(o: AutoProxyOptions): ServiceIdentity | undefined {
  if (!o.serviceName) return undefined;
  return {
    serviceName: o.serviceName,
    ...(o.serviceVersion !== undefined && { serviceVersion: o.serviceVersion }),
    ...(o.environment !== undefined && { environment: o.environment }),
  };
}

// The seam's own capacity (see DEFAULT_NESTJS_BUFFER_CAPACITY) applies only when the caller
// leaves pipeline construction to us — an explicit pipeline is the caller's sizing decision.
function buildPipeline(options: AutoProxyOptions): EventPipeline {
  if (options.pipeline) return options.pipeline;
  const capacity = options.bufferCapacity ?? DEFAULT_NESTJS_BUFFER_CAPACITY;
  return new DualPathPipeline(null, new BufferedEventConsumer(capacity));
}

function createRequestContext(
  options: AutoProxyOptions,
  inheritedTraceId?: TraceId,
): SyncNarrativeContext {
  return new SyncNarrativeContext(
    new NarrativeTraceConfig(options.level ?? "detail"),
    undefined,
    buildPipeline(options),
    null,
    buildIdentity(options),
    inheritedTraceId,
  );
}

// Observability must never fail the request.
function safe(fn: () => void): void {
  try {
    fn();
  } catch {
    // swallowed
  }
}

interface HttpReq {
  method?: string;
  path?: string;
  ip?: string;
  headers?: Record<string, string | string[] | undefined>;
}

function traceparentOf(req: HttpReq | undefined): TraceId | undefined {
  const header = req?.headers?.traceparent;
  return parseTraceparent(typeof header === "string" ? header : undefined) ?? undefined;
}

function safeUser(o: AutoProxyOptions, req: HttpReq | undefined) {
  try {
    return o.extractUser?.(req);
  } catch {
    return undefined;
  }
}

// Mirrors the Express/Hono degrade-per-field contract: a request with no method (an unusual
// execution context) must not also cost the identity fields that resolved fine, and the log
// values returned here are what puts trace_id/route/user fields on a handler's own log lines
// (Express/Hono's LogContext.run equivalent — this seam had no such correlation before).
function stampRequest(
  ctx: SyncNarrativeContext,
  req: HttpReq | undefined,
  o: AutoProxyOptions,
): Record<string, string | number> {
  const user = o.extractUser ? safeUser(o, req) : undefined;
  if (user) ctx.setUserContext(user.enduserId, user.sessionId, user.tenantId);
  if (!req?.method) return { trace_id: ctx.traceId(), ...buildUserLogValues(user) };
  const httpMethod = req.method;
  const httpRoute = (req.path ?? "/") as HttpRoute;
  const clientIp = (req.ip ?? "unknown") as ClientIp;
  ctx.setRequestContext(httpMethod, httpRoute, clientIp);
  return buildRequestLogValues(ctx.traceId(), { httpMethod, httpRoute, clientIp, ...user });
}

// Cleanup steps run independently of one another (no-poison contract): a throwing
// completion callback must not skip reset, and reset must run whether or not a callback was even
// supplied — a request context sharing a caller-supplied pipeline (see AutoProxyOptions.pipeline)
// leaks its spans into it for the life of the process otherwise.
function complete(
  ctx: SyncNarrativeContext,
  http: ReturnType<ExecutionContext["switchToHttp"]>,
  start: number,
  options: AutoProxyOptions,
): void {
  if (options.onRequestComplete) {
    const res = http.getResponse() as { statusCode?: number } | undefined;
    safe(() =>
      options.onRequestComplete?.(ctx, {
        statusCode: res?.statusCode ?? 200,
        durationMs: performance.now() - start,
        tree: ctx.captureTrace(),
      }),
    );
  }
  safe(() => ctx.reset());
}

@Injectable()
export class NarrativeInterceptor implements NestInterceptor {
  constructor(
    private readonly storage: NarrativeStorage,
    @Inject(NARRATIVE_OPTIONS) private readonly options: AutoProxyOptions,
  ) {}

  intercept(executionContext: ExecutionContext, next: CallHandler): Observable<unknown> {
    const http = executionContext.switchToHttp();
    const req = http.getRequest() as HttpReq | undefined;
    const ctx = createRequestContext(this.options, traceparentOf(req));
    const logValues = stampRequest(ctx, req, this.options);
    const start = performance.now();
    const { storage, options } = this;
    return new Observable((subscriber) =>
      storage.run(ctx, () =>
        LogContext.run(logValues, () =>
          next
            .handle()
            .pipe(finalize(() => complete(ctx, http, start, options)))
            .subscribe(subscriber),
        ),
      ),
    );
  }
}
