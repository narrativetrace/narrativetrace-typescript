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
import { ContextExport } from "@narrativetrace/core";
import { LogContext } from "./log-context.js";

/** Caller identity resolved from a request; every field is optional and omitted when absent. */
export interface UserFields {
  enduserId?: EnduserId;
  sessionId?: SessionId;
  tenantId?: TenantId;
}

export interface RequestInfo extends UserFields {
  httpMethod: string;
  httpRoute: HttpRoute;
  clientIp: ClientIp;
}

/**
 * Identity log fields for a resolved user, or `{}` when none resolved.
 *
 * INTENT: the single definition of the identity key names, so a middleware that degrades on a
 * failed request extractor still emits the same keys as the happy path. Each value is
 * request-derived (ultimately caller-supplied, e.g. a JWT claim), so it is exported through
 * {@link ContextExport.sanitize} — control-escaped and length-capped — before it can reach the
 * MDC-equivalent (cross-runtime shape F6, 2026-09-02 audit).
 */
export function buildUserLogValues(user: UserFields | undefined): Record<string, string> {
  if (!user) return {};
  const values: Record<string, string> = {};
  if (user.enduserId !== undefined)
    values["nt.enduser.id"] = ContextExport.sanitize(user.enduserId);
  if (user.sessionId !== undefined)
    values["nt.session.id"] = ContextExport.sanitize(user.sessionId);
  if (user.tenantId !== undefined) values["nt.tenant.id"] = ContextExport.sanitize(user.tenantId);
  return values;
}

export function buildRequestLogValues(
  traceId: string,
  request: RequestInfo,
): Record<string, string | number> {
  const values: Record<string, string | number> = {
    trace_id: traceId,
    "nt.http.method": ContextExport.sanitize(request.httpMethod),
    "nt.http.route": ContextExport.sanitize(request.httpRoute),
  };
  if (request.clientIp !== undefined) {
    values["nt.client.ip"] = ContextExport.sanitize(request.clientIp);
  }
  return { ...values, ...buildUserLogValues(request) };
}

export async function withRequestTrace<T>(
  context: NarrativeContext,
  request: RequestInfo,
  fn: () => T | Promise<T>,
): Promise<T> {
  return context.run(() => {
    context.setRequestContext(request.httpMethod, request.httpRoute, request.clientIp);
    context.setUserContext(request.enduserId, request.sessionId, request.tenantId);
    const logValues = buildRequestLogValues(context.traceId(), request);
    return LogContext.run(logValues, () => fn() as T | Promise<T>);
  });
}
