// SPDX-License-Identifier: BUSL-1.1
// Licensed under the Business Source License 1.1 (see LICENSE); Change Date: four years from publication; Change License: Apache-2.0
// Copyright (c) 2026 Empower Agile
import type { NarrativeContext, SpanId, TraceId } from "@narrativetrace/core";
import { Observable, type Subscriber, type TeardownLogic } from "rxjs";

/** The span an outbound request names as its parent, with the trace it belongs to. */
export interface RequestParent {
  readonly traceId: TraceId;
  readonly spanId: SpanId;
}

/**
 * The traced call whose returned Observable is being subscribed right now.
 *
 * `under` is the span that was open on `ctx` when the subscription began: a span opened since
 * then is nearer to the request than this origin, and outranks it.
 */
interface SubscribingOrigin extends RequestParent {
  readonly ctx: NarrativeContext;
  readonly under: SpanId | null;
}

// Only ever non-empty for the synchronous duration of a `subscribe()` — pushed and popped in one
// stack frame — so it pins no span and no context once that call returns.
const subscribing: SubscribingOrigin[] = [];

function openSpanOf(ctx: NarrativeContext): SpanId | null {
  try {
    return ctx.activeSpanId ?? null;
  } catch {
    return null;
  }
}

/**
 * Whether `value` is an Observable built by rxjs's own `Observable` class — never a subclass
 * (a `Subject` the caller may `next()` into), and never by calling anything on the value.
 */
function isPlainObservable(value: unknown): value is Observable<unknown> {
  if (value === null || typeof value !== "object") return false;
  try {
    return Object.getPrototypeOf(value) === Observable.prototype;
  } catch {
    return false;
  }
}

function subscribeFrom(
  origin: RequestParent & { readonly ctx: NarrativeContext },
  source: Observable<unknown>,
  subscriber: Subscriber<unknown>,
): TeardownLogic {
  subscribing.push({ ...origin, under: openSpanOf(origin.ctx) });
  try {
    return source.subscribe(subscriber);
  } finally {
    subscribing.pop();
  }
}

/**
 * The `wrapResult` hook `provideTraced` hands to `traceObject`: a plain Observable a traced method
 * returns comes back as an Observable that, on every `subscribe()`, lets {@link requestParent}
 * name that method's span — so a lazily sent HttpClient request is parented to the call that made
 * it. Runs inside the method's span; any other result, or no open span, passes through untouched.
 *
 * @remarks Holds no span open: the method's span closes when it returns, as before. The wrapper
 * keeps only the two ids; the origin is visible only while `subscribe()` runs synchronously, so a
 * request a later tick starts (after a timer or another request) carries no origin from here.
 */
export function bindToOpenSpan(ctx: NarrativeContext): (result: unknown) => unknown {
  return (result) => {
    const spanId = openSpanOf(ctx);
    if (spanId === null || !isPlainObservable(result)) return result;
    const origin = { ctx, traceId: ctx.traceId(), spanId };
    return new Observable((subscriber) => subscribeFrom(origin, result, subscriber));
  };
}

/**
 * The parent an outbound request from `ctx` names in its `traceparent`, or `null` for none: the
 * traced method whose Observable is being subscribed, unless a span opened on `ctx` since that
 * subscription began; else the span open on `ctx`; else none. Never throws (no-poison).
 */
export function requestParent(ctx: NarrativeContext): RequestParent | null {
  try {
    const open = openSpanOf(ctx);
    const origin = subscribing[subscribing.length - 1];
    if (origin !== undefined && origin.ctx === ctx && origin.under === open) return origin;
    return open === null ? null : { traceId: ctx.traceId(), spanId: open };
  } catch {
    return null;
  }
}
