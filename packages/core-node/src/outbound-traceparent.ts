// SPDX-License-Identifier: BUSL-1.1
// Licensed under the Business Source License 1.1 (see LICENSE); Change Date: four years from publication; Change License: Apache-2.0
// Copyright (c) 2026 Empower Agile
import { formatTraceparent } from "@narrativetrace/core";
import type { AsyncNarrativeContext } from "./async-context.js";

/**
 * The W3C `traceparent` header that continues the current trace into a downstream call.
 *
 * @param ctx the context whose active span is the caller.
 * @returns `{ traceparent }` — the current trace id, the active span id as parent, sampled flag —
 * or `{}` when no span is active (nothing to continue). Spread it into any HTTP client's headers
 * (`http`, `axios`, `undici`); {@link tracedFetch} does so for global `fetch`.
 */
export function traceparentHeaders(ctx: AsyncNarrativeContext): { traceparent?: string } {
  const spanId = ctx.activeSpanId;
  if (spanId === null) return {};
  return { traceparent: formatTraceparent(ctx.traceId(), spanId) };
}

/**
 * Global `fetch` (Node 20+) that stamps the current span's `traceparent` on each request, so an
 * instrumented callee joins the caller's trace. Same call as the browser's `tracedFetch`.
 *
 * @param ctx the context whose active span is read at call time, per request.
 * @returns a `fetch`-compatible function. A `traceparent` the caller already set — on `init` or
 * on a `Request` input — is never overwritten; with no active span no header is added.
 */
export function tracedFetch(ctx: AsyncNarrativeContext): typeof globalThis.fetch {
  return (input, init) => {
    const base = input instanceof Request ? input.headers : undefined;
    const headers = new Headers(init?.headers ?? base);
    for (const [name, value] of Object.entries(traceparentHeaders(ctx))) {
      if (!headers.has(name)) headers.set(name, value);
    }
    return globalThis.fetch(input, { ...init, headers });
  };
}
