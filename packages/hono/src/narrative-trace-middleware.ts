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
import type { Context, MiddlewareHandler } from "hono";
import type { GetConnInfo } from "hono/conninfo";

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
  extractRequest?: (c: Context) => RequestInfo;
  extractUser?: (c: Context) => UserInfo | undefined;
  onRequestComplete?: (c: Context, ctx: NarrativeContext, completion: RequestCompletion) => void;
  /** Paths for which no trace context / log scope is created (health checks, static assets). */
  excludedPaths?: string[];
}

const CONTEXT_KEY = "narrativeContext" as const;

/** The context the middleware ran for this request via `c.get("narrativeContext")`. */
export function getNarrativeContext(c: Context): NarrativeContext | undefined {
  return c.get(CONTEXT_KEY) as NarrativeContext | undefined;
}

// Observability must never fail the request: a throwing extractor/callback is swallowed.
function safe<T>(fn: () => T): T | undefined {
  try {
    return fn();
  } catch {
    return undefined;
  }
}

// `x-forwarded-for` is attacker-controlled end to end: unlike Express's `req.ip` (which honors an
// app-configured `trust proxy` boundary), Hono's base package has no runtime-agnostic notion of a
// trusted hop count, and this package does not invent one. clientIp is "unknown" until the app
// opts in via `withConnInfoClientIp` (or its own `extractRequest`) with a `getConnInfo` for its
// deployment target.
export function extractRequestInfo(c: Context): RequestInfo {
  return {
    httpMethod: c.req.method,
    httpRoute: c.req.path as HttpRoute,
    clientIp: "unknown" as ClientIp,
  };
}

/**
 * Wraps a request extractor so `clientIp` comes from a Hono `getConnInfo` (e.g. `hono/deno`,
 * `hono/bun`, `hono/cloudflare-workers`, or `@hono/node-server/conninfo` for Node) instead of the
 * default `"unknown"`. Use this only when `getConnInfo` reports the real peer address for your
 * deployment target — behind a reverse proxy that terminates TLS, that is the proxy's address,
 * not the original client's, unless the proxy itself is the thing calling `getConnInfo`.
 */
export function withConnInfoClientIp(
  getConnInfo: GetConnInfo,
  extract: (c: Context) => RequestInfo = extractRequestInfo,
): (c: Context) => RequestInfo {
  return (c) => ({
    ...extract(c),
    clientIp: (getConnInfo(c).remote.address ?? "unknown") as ClientIp,
  });
}

function applyUserContext(ctx: NarrativeContext, user: UserInfo | undefined): void {
  if (user) ctx.setUserContext(user.enduserId, user.sessionId, user.tenantId);
}

function setupRequestContext(
  ctx: NarrativeContext,
  c: Context,
  extract: (c: Context) => RequestInfo,
  extractUser?: (c: Context) => UserInfo | undefined,
): Record<string, string | number> {
  const info = safe(() => extract(c));
  const user = extractUser ? safe(() => extractUser(c)) : undefined;
  if (user) applyUserContext(ctx, user);
  // Degrade per-field, not wholesale: a failing request extractor must not also discard identity
  // that resolved fine (Java stamps the user MDC keys independently of the HTTP ones).
  if (!info) return { trace_id: ctx.traceId(), ...buildUserLogValues(user) };
  ctx.setRequestContext(info.httpMethod, info.httpRoute, info.clientIp);
  return buildRequestLogValues(ctx.traceId(), { ...info, ...user });
}

// A throwing handler must still fire completion (aligns with express res.on("finish") / Java doFinally).
// Cleanup steps run independently of one another (no-poison contract): a throwing
// completion callback must not skip reset, and reset must run whether or not a callback was even
// supplied — a request-scoped context left un-reset leaks its spans into the shared pipeline for
// the life of the process.
function fireCompletion(
  c: Context,
  ctx: NarrativeContext,
  start: number,
  onComplete: NarrativeTraceOptions["onRequestComplete"],
): void {
  if (onComplete) {
    const durationMs = performance.now() - start;
    safe(() => onComplete(c, ctx, { statusCode: c.res.status, durationMs }));
  }
  safe(() => ctx.reset());
}

async function runScoped(
  c: Context,
  next: () => Promise<void>,
  ctx: NarrativeContext,
  extract: (c: Context) => RequestInfo,
  options?: NarrativeTraceOptions,
): Promise<void> {
  c.set(CONTEXT_KEY, ctx);
  const logValues = setupRequestContext(ctx, c, extract, options?.extractUser);
  const start = performance.now();
  await LogContext.run(logValues, async () => {
    try {
      await next();
    } finally {
      fireCompletion(c, ctx, start, options?.onRequestComplete);
    }
  });
}

export function narrativeTrace(
  ctx: NarrativeContext,
  options?: NarrativeTraceOptions,
): MiddlewareHandler {
  const extract = options?.extractRequest ?? extractRequestInfo;
  const excluded = new Set(options?.excludedPaths ?? []);
  return async (c, next) => {
    if (excluded.has(c.req.path)) return next();
    const inheritedTraceId = parseTraceparent(c.req.header("traceparent"));
    await ctx.run(() => runScoped(c, next, ctx, extract, options), inheritedTraceId);
  };
}
