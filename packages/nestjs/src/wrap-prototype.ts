// SPDX-License-Identifier: BUSL-1.1
// Licensed under the Business Source License 1.1 (see LICENSE); Change Date: four years from publication; Change License: Apache-2.0
// Copyright (c) 2026 Empower Agile
import {
  isThenable,
  parameterCapture,
  renderValue,
  type SpanId,
  type SyncNarrativeContext,
} from "@narrativetrace/core";
import type { NarrativeStorage } from "./narrative-storage.js";
import { isNoAutoProxy } from "./no-auto-proxy.decorator.js";

const WRAPPED = Symbol("NT_WRAPPED");

// The business outcome must always reach the caller even if recording the exit throws
// (no-poison contract — mirrors packages/proxy's recordReturn/recordException).
function recordReturn(ctx: SyncNarrativeContext, val: unknown, handle: SpanId): void {
  try {
    ctx.exitMethodWithReturn(renderValue(val), handle);
  } catch {
    // observability failure must never become an application failure
  }
}

function recordException(ctx: SyncNarrativeContext, err: unknown, handle: SpanId): void {
  try {
    ctx.exitMethodWithException(err, handle);
  } catch {
    // observability failure must never become an application failure
  }
}

function settleReturn(ctx: SyncNarrativeContext, handle: SpanId) {
  return (val: unknown) => {
    recordReturn(ctx, val, handle);
    return val;
  };
}

function settleException(ctx: SyncNarrativeContext, handle: SpanId) {
  return (err: unknown) => {
    recordException(ctx, err, handle);
    throw err;
  };
}

// A custom thenable whose then() throws on registration must not replace the object the business
// call actually returned (no-poison contract).
function exitAsync(
  ctx: SyncNarrativeContext,
  promise: PromiseLike<unknown>,
  handle: SpanId,
): PromiseLike<unknown> {
  try {
    ctx.detachFrame(handle);
    return promise.then(settleReturn(ctx, handle), settleException(ctx, handle));
  } catch {
    return promise;
  }
}

function exitSync(ctx: SyncNarrativeContext, result: unknown, handle: SpanId) {
  if (isThenable(result)) return exitAsync(ctx, result, handle);
  recordReturn(ctx, result, handle);
  return result;
}

// Best-effort by construction: any failure while rendering parameters or entering the span
// (including a custom NarrativeContext.enterMethod) must degrade to an untraced call, never block
// the business method from running at all (no-poison contract).
function buildEntry(
  ctx: SyncNarrativeContext,
  args: unknown[],
  className: string,
  methodName: string,
): SpanId | undefined {
  try {
    const captures = args.map((a, i) => parameterCapture(`arg${i}`, renderValue(a), false));
    return ctx.enterMethod(className, methodName, captures);
  } catch {
    return undefined;
  }
}

function tracedCall(
  ctx: SyncNarrativeContext,
  original: Function,
  self: unknown,
  args: unknown[],
  className: string,
  methodName: string,
) {
  const handle = buildEntry(ctx, args, className, methodName);
  if (handle === undefined) return Reflect.apply(original, self, args);
  try {
    const result = ctx.runScoped(handle, () => Reflect.apply(original, self, args));
    return exitSync(ctx, result, handle);
  } catch (error) {
    recordException(ctx, error, handle);
    throw error;
  }
}

function createWrapper(
  original: Function,
  className: string,
  methodName: string,
  storage: NarrativeStorage,
) {
  const wrapper = function (this: unknown, ...args: unknown[]) {
    const ctx = storage.current();
    if (!ctx) return Reflect.apply(original, this, args);
    return tracedCall(ctx, original, this, args, className, methodName);
  };
  Object.defineProperty(wrapper, WRAPPED, { value: true });
  return wrapper;
}

export function wrapPrototypeMethods(
  prototype: object,
  className: string,
  storage: NarrativeStorage,
): void {
  for (const key of Object.getOwnPropertyNames(prototype)) {
    if (key === "constructor") continue;
    const descriptor = Object.getOwnPropertyDescriptor(prototype, key);
    if (!descriptor || typeof descriptor.value !== "function") continue;
    if ((descriptor.value as Record<symbol, unknown>)[WRAPPED]) continue;
    if (isNoAutoProxy(prototype, key)) continue;
    Object.defineProperty(prototype, key, {
      ...descriptor,
      value: createWrapper(descriptor.value, className, key, storage),
    });
  }
}
