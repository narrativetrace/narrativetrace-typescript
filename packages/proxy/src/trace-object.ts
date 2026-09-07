// SPDX-License-Identifier: BUSL-1.1
// Licensed under the Business Source License 1.1 (see LICENSE); Change Date: four years from publication; Change License: Apache-2.0
// Copyright (c) 2026 Empower Agile
import type { NarrativeContext, ParameterCapture, SpanId } from "@narrativetrace/core";
import {
  isThenable,
  parameterCapture,
  RedactionPolicy,
  renderStructured,
  renderValue,
  resolveTemplate,
} from "@narrativetrace/core";
import { getErrorSpecs, getNarration, type OnErrorSpec } from "./narrated.js";
import { getRedactedParams } from "./not-traced.js";
import { getTracedParamNames } from "./traced.js";

/**
 * Tuning knobs for {@link traceObject}.
 *
 * INTENT: pass this when the defaults derived from the target don't fit — e.g. the runtime
 * `constructor.name` is minified/wrong, or you want to suppress return-value capture for a
 * chatty or sensitive method surface.
 *
 * @llmNote Rendering the captured arguments and return values reached through the traced object
 * may invoke members on them — a custom `toString()`, a `@narrativeSummary` method, or any
 * property path named in a `@narrated`/`@onError` template (`{order.total}` runs the `total`
 * getter). Keep those members **pure** (no lazy loading, counters, caches, or I/O). Every
 * invocation is bounded and exception-isolated, so a throwing member never fails the business
 * call; with tracing off nothing is touched. Redact members you cannot make pure with
 * `@notTraced` / `static notTraced`. (This is the purity contract — see README.md and
 * documentation/decorators-guide.md.)
 */
export type ProxyOptions = {
  /**
   * Class name recorded on every span, overriding the target's runtime `constructor.name`.
   * @defaultValue `target.constructor.name`
   */
  readonly className?: string;
  /**
   * Whether return values are rendered and captured on method exit.
   * @defaultValue `true` — set `false` to record only that a method returned, not what.
   */
  readonly includeReturnValues?: boolean;
};

type AnyFn = (...args: never[]) => unknown;

function resolveNames(fn: AnyFn, explicitNames: string[] | undefined): string[] | undefined {
  const tracedNames = getTracedParamNames(fn);
  return explicitNames ?? (tracedNames ? [...tracedNames] : undefined);
}

function paramName(names: string[] | undefined, i: number): string {
  return names?.[i] ?? `arg${i}`;
}

function buildCaptures(
  args: unknown[],
  names: string[] | undefined,
  redacted: ReadonlySet<number> | undefined,
  captureValues: boolean,
): ParameterCapture[] {
  return args.map((arg, i) => {
    const isRedacted = redacted?.has(i) ?? false;
    const value = renderCaptureValue(arg, isRedacted, captureValues);
    const structured = captureValues && !isRedacted ? renderStructured(arg) : undefined;
    return parameterCapture(paramName(names, i), value, isRedacted, structured);
  });
}

// Skip value rendering entirely when the context won't retain it (OFF/SUMMARY/NARRATIVE),
// rather than rendering and discarding post-hoc (Java capturesParameterValues hint).
function renderCaptureValue(arg: unknown, isRedacted: boolean, captureValues: boolean): string {
  if (!captureValues) return "";
  return isRedacted ? RedactionPolicy.MARKER : renderValue(arg);
}

// Values for template substitution: a redacted parameter resolves to the marker so a secret
// cannot leak through a narration/error template even though the raw arg is available here.
function buildValueMap(
  args: unknown[],
  names: string[] | undefined,
  redacted: ReadonlySet<number> | undefined,
): Record<string, unknown> {
  const values: Record<string, unknown> = {};
  args.forEach((arg, i) => {
    values[paramName(names, i)] = redacted?.has(i) ? RedactionPolicy.MARKER : arg;
  });
  return values;
}

function buildMethodOptions(fn: AnyFn, values: Record<string, unknown>) {
  const rawNarration = getNarration(fn);
  if (rawNarration === undefined) return undefined;
  return { narration: resolveTemplate(rawNarration, values) };
}

// @onError context resolves at throw time against the actual thrown type, choosing the most
// specific matching declaration (Java resolveErrorContext / findMostSpecificOnError).
function resolveErrorContext(
  fn: AnyFn,
  values: Record<string, unknown>,
  error: unknown,
): string | null {
  const match = findMostSpecific(getErrorSpecs(fn), error);
  return match ? resolveTemplate(match.template, values) : null;
}

function findMostSpecific(specs: readonly OnErrorSpec[], error: unknown): OnErrorSpec | undefined {
  let best: OnErrorSpec | undefined;
  for (const spec of specs) {
    if (specMatches(spec, error) && (best === undefined || isMoreSpecific(spec, best))) {
      best = spec;
    }
  }
  return best;
}

function specMatches(spec: OnErrorSpec, error: unknown): boolean {
  return spec.exception === undefined || error instanceof spec.exception;
}

function isMoreSpecific(candidate: OnErrorSpec, best: OnErrorSpec): boolean {
  if (candidate.exception === undefined) return best.exception === undefined;
  if (best.exception === undefined) return true;
  return isSubclassOf(candidate.exception, best.exception);
}

function isSubclassOf(sub: OnErrorSpec["exception"], sup: OnErrorSpec["exception"]): boolean {
  if (sub === undefined || sup === undefined) return false;
  return sub === sup || sub.prototype instanceof sup;
}

/**
 * The rendered form of a return value, or `null` for a completion that carries no value.
 *
 * @remarks JavaScript has no static `void`, so a method that returns nothing yields `undefined` —
 * and rendering that as the *string* `"undefined"` made every renderer hide a value by comparing
 * against it, and put `"returnValue": "undefined"` into artifacts where a value was never
 * produced. `null` is the cross-runtime void contract (Java's `Returned.renderedValue == null`), and
 * it is the same answer capture already gives when the return is suppressed.
 *
 * A method that returns the *string* `"undefined"` is unaffected: it renders quoted.
 */
function renderReturn(value: unknown, enabled: boolean): string | null {
  if (!enabled || value === undefined) return null;
  return renderValue(value);
}

type ErrorContextResolver = (error: unknown) => string | null;

function settleReturn(ctx: NarrativeContext, includeReturn: boolean, handle: SpanId) {
  return (val: unknown) => {
    recordReturn(ctx, val, includeReturn, handle);
    return val;
  };
}

function settleException(ctx: NarrativeContext, handle: SpanId, onError: ErrorContextResolver) {
  return (err: unknown) => {
    recordException(ctx, err, handle, onError);
    throw err;
  };
}

function exitAsyncResult(
  ctx: NarrativeContext,
  promise: PromiseLike<unknown>,
  includeReturn: boolean,
  handle: SpanId,
  onError: ErrorContextResolver,
): PromiseLike<unknown> {
  try {
    ctx.detachFrame(handle);
    return promise.then(
      settleReturn(ctx, includeReturn, handle),
      settleException(ctx, handle, onError),
    );
  } catch {
    // A custom thenable whose then() throws on registration must not replace the object the
    // business call actually returned (no-poison contract).
    return promise;
  }
}

// The business outcome must always reach the caller even if rendering the value
// or recording the exit throws (Java exitDeferredWrapped's finally guarantee).
function recordReturn(ctx: NarrativeContext, val: unknown, includeReturn: boolean, handle: SpanId) {
  try {
    const structured = includeReturn ? renderStructured(val) : undefined;
    ctx.exitMethodWithReturn(renderReturn(val, includeReturn), handle, structured);
  } catch {
    // observability failure must never become an application failure
  }
}

function recordException(
  ctx: NarrativeContext,
  err: unknown,
  handle: SpanId,
  onError: ErrorContextResolver,
) {
  try {
    ctx.exitMethodWithException(err, handle, onError(err));
  } catch {
    // observability failure must never become an application failure
  }
}

function exitWithResult(
  ctx: NarrativeContext,
  result: unknown,
  includeReturn: boolean,
  handle: SpanId,
  onError: ErrorContextResolver,
) {
  if (isThenable(result)) return exitAsyncResult(ctx, result, includeReturn, handle, onError);
  recordReturn(ctx, result, includeReturn, handle);
  return result;
}

type TracingConfig = {
  context: NarrativeContext;
  className: string;
  includeReturnValues: boolean;
  paramNames?: Record<string, string[]>;
};

function invokeTarget(fn: AnyFn, obj: object, args: unknown[]): unknown {
  return Reflect.apply(fn as (...a: unknown[]) => unknown, obj, args);
}

type EntryInfo = { handle: SpanId; onError: ErrorContextResolver };
type EntryCaptures = { captures: ParameterCapture[]; values: Record<string, unknown> };

function buildEntryCaptures(
  fn: AnyFn,
  methodName: string,
  args: unknown[],
  config: TracingConfig,
): EntryCaptures {
  const names = resolveNames(fn, config.paramNames?.[methodName]);
  const redacted = getRedactedParams(fn);
  const values = buildValueMap(args, names, redacted);
  const captures = buildCaptures(args, names, redacted, config.context.capturesParameterValues);
  return { captures, values };
}

// Best-effort by construction: any failure while resolving names, rendering parameters or entering
// the span (including a custom NarrativeContext.enterMethod) must degrade to an untraced call, never
// block the business method from running at all (no-poison contract).
function buildEntry(
  fn: AnyFn,
  methodName: string,
  args: unknown[],
  config: TracingConfig,
): EntryInfo | undefined {
  try {
    const { captures, values } = buildEntryCaptures(fn, methodName, args, config);
    const handle = config.context.enterMethod(
      config.className,
      methodName,
      captures,
      buildMethodOptions(fn, values),
    );
    return { handle, onError: (error) => resolveErrorContext(fn, values, error) };
  } catch {
    return undefined;
  }
}

function wrapMethod(fn: AnyFn, obj: object, methodName: string, config: TracingConfig) {
  const { context: ctx, includeReturnValues } = config;
  return function (this: unknown, ...args: unknown[]) {
    // Inactive context: invoke the target with zero capture/metadata/template work.
    if (!ctx.isActive) return invokeTarget(fn, obj, args);
    const entry = buildEntry(fn, methodName, args, config);
    if (!entry) return invokeTarget(fn, obj, args);
    const { handle, onError } = entry;
    try {
      const result = ctx.runScoped(handle, () => invokeTarget(fn, obj, args));
      return exitWithResult(ctx, result, includeReturnValues, handle, onError);
    } catch (error) {
      recordException(ctx, error, handle, onError);
      throw error;
    }
  };
}

function buildTracingConfig(
  target: object,
  context: NarrativeContext,
  paramNames: Record<string, string[]> | undefined,
  options: ProxyOptions | undefined,
): TracingConfig {
  return {
    context,
    className: options?.className ?? target.constructor.name,
    includeReturnValues: options?.includeReturnValues !== false,
    ...(paramNames !== undefined && { paramNames }),
  };
}

function isGetterProperty(obj: object, prop: string | symbol): boolean {
  let current: object | null = obj;
  while (current !== null) {
    const desc = Object.getOwnPropertyDescriptor(current, prop);
    if (desc !== undefined) return desc.get !== undefined;
    current = Object.getPrototypeOf(current) as object | null;
  }
  return false;
}

// Coercion/inspection hooks are ordinary object operations, not business calls — tracing them
// pollutes every capture with spans the caller never asked for (String(x), x + 1, template
// literals, console.log all reach one of these). JS has no user-overridable equals/hashCode to
// exempt the way Java does; identity (`===`) is already reflexive for a Proxy regardless (no-poison
// contract).
const ORDINARY_OBJECT_OPS: ReadonlySet<string | symbol> = new Set([
  "toString",
  "valueOf",
  Symbol.toPrimitive,
  Symbol.for("nodejs.util.inspect.custom"),
]);

function createTracingHandler<T extends object>(config: TracingConfig): ProxyHandler<T> {
  return {
    get(obj, prop, receiver) {
      const value = Reflect.get(obj, prop, receiver);
      const skip =
        typeof value !== "function" || isGetterProperty(obj, prop) || ORDINARY_OBJECT_OPS.has(prop);
      if (skip) return value;
      return wrapMethod(value as AnyFn, obj, String(prop), config);
    },
  };
}

/**
 * Wraps an object in a transparent tracing proxy: every method call is recorded into `context`
 * with its parameter captures, narration, and error context, while the original return value
 * (or thrown error) still flows through untouched.
 *
 * INTENT: reach for this to trace a plain instance without touching its class — the proxy
 * intercepts method access, so decorator metadata from `@traced`/`@narrated`/`@onError`/
 * `@notTraced` is honoured on the wrapped methods. Getters and non-function properties pass
 * through unwrapped.
 *
 * @param target the object to trace; the returned proxy has the same type `T`.
 * @param context sink and gate for spans — when `context.isActive` is false the proxy invokes
 * the target with zero capture work, so an inactive context has no rendering cost.
 * @param paramNames optional per-method override of parameter names (keyed by method name),
 * used when a method has no `@traced` names; falls back to `arg0`, `arg1`, … otherwise.
 * @param options see {@link ProxyOptions} — override the class name or disable return capture.
 * @returns a proxy of the same shape as `target`; recording failures are swallowed so
 * observability never turns into an application error.
 *
 * @llmNote Argument and return-value rendering may invoke members on your objects (custom
 * `toString()`, `@narrativeSummary`, property paths named in `@narrated`/`@onError` templates).
 * Keep those members pure; invocations are bounded and exception-isolated, and with tracing off
 * nothing is touched. Redact with `@notTraced` / `static notTraced`. (Purity contract — see
 * README.md and documentation/decorators-guide.md.)
 *
 * @example
 * ```ts
 * const context = new SyncNarrativeContext(new NarrativeTraceConfig());
 * const traced = traceObject(orderService, context);
 * traced.placeOrder("C1", "P1", 2);
 * console.log(renderMarkdown(context.captureTrace()));
 * ```
 */
export function traceObject<T extends object>(
  target: T,
  context: NarrativeContext,
  paramNames?: Record<string, string[]>,
  options?: ProxyOptions,
): T {
  return new Proxy(
    target,
    createTracingHandler(buildTracingConfig(target, context, paramNames, options)),
  );
}
