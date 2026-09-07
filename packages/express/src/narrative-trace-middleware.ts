// SPDX-License-Identifier: BUSL-1.1
// Licensed under the Business Source License 1.1 (see LICENSE); Change Date: four years from publication; Change License: Apache-2.0
// Copyright (c) 2026 Empower Agile
import type {
  ClientIp,
  EnduserId,
  HttpRoute,
  NarrativeContext,
  SessionId,
  TenantId,
} from "@narrativetrace/core";
import { parseTraceparent } from "@narrativetrace/core";
import type { RequestInfo } from "@narrativetrace/observability";
import {
  buildRequestLogValues,
  buildUserLogValues,
  LogContext,
} from "@narrativetrace/observability";
import type { Request, RequestHandler, Response } from "express";

export interface UserInfo {
  enduserId?: EnduserId;
  sessionId?: SessionId;
  tenantId?: TenantId;
}

export interface RequestCompletion {
  readonly statusCode: number;
  readonly durationMs: number;
}

export interface NarrativeTraceOptions {
  extractRequest?: (req: Request) => RequestInfo;
  extractUser?: (req: Request) => UserInfo | undefined;
  onRequestComplete?: (
    req: Request,
    res: Response,
    ctx: NarrativeContext,
    completion: RequestCompletion,
  ) => void;
  /** Paths for which no trace context / log scope is created (health checks, static assets). */
  excludedPaths?: string[];
}

const CONTEXT_KEY = "__narrativeContext" as const;

/** The context the middleware ran for this request, or undefined if middleware is absent/excluded. */
export function getNarrativeContext(req: Request): NarrativeContext | undefined {
  return (req as Request & { [CONTEXT_KEY]?: NarrativeContext })[CONTEXT_KEY];
}

// Observability must never fail the request: a throwing extractor is swallowed and the request
// proceeds with whatever metadata was gathered before the failure (Java prepareContext try/catch).
function safe<T>(fn: () => T): T | undefined {
  try {
    return fn();
  } catch {
    return undefined;
  }
}

export function extractRequestInfo(req: Request): RequestInfo {
  return {
    httpMethod: req.method,
    httpRoute: req.path as HttpRoute,
    clientIp: (req.ip ?? "unknown") as ClientIp,
  };
}

function applyUserContext(ctx: NarrativeContext, user: UserInfo | undefined): void {
  if (user) ctx.setUserContext(user.enduserId, user.sessionId, user.tenantId);
}

function setupRequestContext(
  ctx: NarrativeContext,
  req: Request,
  extract: (r: Request) => RequestInfo,
  extractUser?: (r: Request) => UserInfo | undefined,
): Record<string, string | number> {
  const info = safe(() => extract(req));
  const user = extractUser ? safe(() => extractUser(req)) : undefined;
  if (user) applyUserContext(ctx, user);
  // Degrade per-field, not wholesale: a failing request extractor must not also discard identity
  // that resolved fine (Java stamps the user MDC keys independently of the HTTP ones).
  if (!info) return { trace_id: ctx.traceId(), ...buildUserLogValues(user) };
  ctx.setRequestContext(info.httpMethod, info.httpRoute, info.clientIp);
  return buildRequestLogValues(ctx.traceId(), { ...info, ...user });
}

export function narrativeTrace(
  ctx: NarrativeContext,
  options?: NarrativeTraceOptions,
): RequestHandler {
  const extract = options?.extractRequest ?? extractRequestInfo;
  const excluded = new Set(options?.excludedPaths ?? []);
  return (req, res, next) => {
    if (excluded.has(req.path)) return next();
    const inheritedTraceId = parseTraceparent(req.header("traceparent"));
    ctx.run(() => {
      (req as Request & { [CONTEXT_KEY]?: NarrativeContext })[CONTEXT_KEY] = ctx;
      const logValues = setupRequestContext(ctx, req, extract, options?.extractUser);
      LogContext.run(logValues, () => {
        registerCompletion(req, res, ctx, options?.onRequestComplete);
        next();
      });
    }, inheritedTraceId);
  };
}

// Cleanup steps run independently of one another (no-poison contract): a throwing
// completion callback must not skip reset, and reset must run whether or not a callback was even
// supplied — a request-scoped context left un-reset leaks its spans into the shared pipeline for
// the life of the process.
function registerCompletion(
  req: Request,
  res: Response,
  ctx: NarrativeContext,
  onComplete: NarrativeTraceOptions["onRequestComplete"],
): void {
  const start = performance.now();
  res.on("finish", () => {
    if (onComplete) {
      safe(() =>
        onComplete(req, res, ctx, {
          statusCode: res.statusCode,
          durationMs: performance.now() - start,
        }),
      );
    }
    safe(() => ctx.reset());
  });
}
