// SPDX-License-Identifier: BUSL-1.1
// Licensed under the Business Source License 1.1 (see LICENSE); Change Date: four years from publication; Change License: Apache-2.0
// Copyright (c) 2026 Empower Agile
declare const HttpRouteBrand: unique symbol;
/**
 * A nominal (branded) HTTP route template, e.g. `/users/:id`.
 *
 * INTENT: a plain string cannot be assigned where a route is expected, so raw request paths and
 * user input can't silently flow into span attributes. Construct via the correlation helpers rather
 * than casting.
 */
export type HttpRoute = string & { readonly [HttpRouteBrand]: true };

declare const ClientIpBrand: unique symbol;
/**
 * A nominal (branded) client IP address, kept distinct from arbitrary strings so it can't be
 * confused with other identifiers when populating a {@link SpanContext}.
 */
export type ClientIp = string & { readonly [ClientIpBrand]: true };

declare const EnduserIdBrand: unique symbol;
/**
 * A nominal (branded) end-user identifier for `enduser.*` span correlation, distinct from session
 * and tenant ids so they cannot be cross-assigned.
 */
export type EnduserId = string & { readonly [EnduserIdBrand]: true };

declare const SessionIdBrand: unique symbol;
/** A nominal (branded) session identifier, kept type-distinct from other correlation ids. */
export type SessionId = string & { readonly [SessionIdBrand]: true };

declare const TenantIdBrand: unique symbol;
/** A nominal (branded) tenant identifier for multi-tenant correlation, distinct from user/session ids. */
export type TenantId = string & { readonly [TenantIdBrand]: true };
