// SPDX-License-Identifier: BUSL-1.1
// Licensed under the Business Source License 1.1 (see LICENSE); Change Date: four years from publication; Change License: Apache-2.0
// Copyright (c) 2026 Empower Agile
import type { NarrativeContext, ParameterCapture, SpanId } from "@narrativetrace/core";
import {
  isThenable,
  NOOP_CONTEXT,
  parameterCapture,
  RedactionPolicy,
  renderCapture,
  renderStructured,
  renderValue,
  resolveTemplate,
} from "@narrativetrace/core";
import { type ErrorClass, getErrorSpecs, getNarration, type OnErrorSpec } from "./narrated.js";
import { getRedactedParams } from "./not-traced.js";
import { getTracedParamNames } from "./traced.js";

/**
 * One error-context declaration in config form: the template, plus the optional error type it
 * applies to — the non-decorator twin of one `@onError(...)` application. `exception` matches by
 * `instanceof`; omit it for a catch-all. Several declarations cover distinct types; the one
 * matching the thrown type most specifically wins at throw time, exactly as stacked `@onError`
 * decorators do.
 */
export type OnErrorTemplate = {
  readonly exception?: ErrorClass;
  readonly template: string;
};

/**
 * Per-method trace configuration — the config twin of the four decorators, declared at the
 * composition root instead of on the class.
 *
 * INTENT: everything `@traced`/`@narrated`/`@onError`/`@notTraced` express, expressible where
 * the object is wrapped — for plain JavaScript, for environments that do not compile decorators,
 * and for teams that prefer trace metadata beside the wiring rather than on the class. Each
 * axis, when present, takes precedence over the corresponding decorator metadata for that
 * method; an absent axis leaves the decorator's declaration in force.
 *
 * @llmNote A single `onError` string is the catch-all shorthand, twin of `@onError("...")`;
 * the array form twins stacked `@onError` declarations, most-specific match winning.
 */
export type MethodTraceConfig = {
  /** Positional parameter names — twin of `@traced("a", "b")`. */
  readonly params?: readonly string[];
  /** Zero-based indices of parameters to redact — twin of `@notTraced(1, 2)`. */
  readonly notTraced?: readonly number[];
  /** Narration template with `{param}` placeholders — twin of `@narrated("...")`. */
  readonly narration?: string;
  /** Error-context declarations — twin of (stacked) `@onError`. */
  readonly onError?: string | readonly OnErrorTemplate[];
};

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
  /**
   * Per-method trace configuration keyed by method name — the config twin of the decorators.
   * A configured axis (params/notTraced/narration/onError) overrides the corresponding
   * decorator metadata for that method; anything not configured falls back to the decorators.
   */
  readonly methods?: Record<string, MethodTraceConfig>;
};

type AnyFn = (...args: never[]) => unknown;

function resolveNames(
  fn: AnyFn,
  explicitNames: readonly string[] | undefined,
): string[] | undefined {
  if (explicitNames) return [...explicitNames];
  const tracedNames = getTracedParamNames(fn);
  return tracedNames ? [...tracedNames] : undefined;
}

// Config-over-decorator precedence, per axis: a configured axis replaces the decorator's
// declaration for that method wholesale; an absent axis leaves the decorator in force.
function resolveRedacted(
  fn: AnyFn,
  cfg: MethodTraceConfig | undefined,
): ReadonlySet<number> | undefined {
  return cfg?.notTraced ? new Set(cfg.notTraced) : getRedactedParams(fn);
}

function effectiveErrorSpecs(
  fn: AnyFn,
  cfg: MethodTraceConfig | undefined,
): readonly OnErrorSpec[] {
  if (cfg?.onError === undefined) return getErrorSpecs(fn);
  return typeof cfg.onError === "string" ? [{ template: cfg.onError }] : cfg.onError;
}

function paramName(names: string[] | undefined, i: number): string {
  return names?.[i] ?? `arg${i}`;
}

// The single redaction decision per parameter — an explicit @notTraced index always redacts,
// and otherwise the same always-on NAME deny-list that already guards object field names decides
// (RedactionPolicy.isRedacted). Computed once here and threaded into both buildCaptures and
// buildValueMap so the two can never drift: a parameter named like a secret (`paymentToken`) must
// be redacted in the capture AND in any @narrated/@onError template that names it, with no
// decorator required — the two surfaces sharing one decision is the same rule
// RedactionPolicy.isRedacted's own doc comment states for field introspection.
function resolveRedactedFlags(
  args: unknown[],
  names: string[] | undefined,
  annotatedIndices: ReadonlySet<number> | undefined,
): boolean[] {
  return args.map((_, i) => {
    const annotated = annotatedIndices?.has(i) ?? false;
    return RedactionPolicy.DEFAULT.isRedacted(paramName(names, i), annotated);
  });
}

function buildCaptures(
  args: unknown[],
  names: string[] | undefined,
  redactedFlags: readonly boolean[],
  captureValues: boolean,
): ParameterCapture[] {
  return args.map((arg, i) => {
    const nameAxisRedacted = redactedFlags[i] ?? false;
    const { value, shapeRedacted } = renderCaptureValue(arg, nameAxisRedacted, captureValues);
    const isRedacted = nameAxisRedacted || shapeRedacted;
    const structured = captureValues && !isRedacted ? renderStructured(arg) : undefined;
    return parameterCapture(paramName(names, i), value, isRedacted, structured);
  });
}

// Skip value rendering entirely when the context won't retain it (OFF/SUMMARY/NARRATIVE), rather
// than rendering and discarding post-hoc (Java capturesParameterValues hint). The name axis, when
// it fires, short-circuits before the value is ever rendered — RedactionPolicy.MARKER substitutes
// directly, never renderCapture(arg) — the same promise every @notTraced/deny-listed parameter
// already makes: the raw value never reaches a renderer. `shapeRedacted` flags a value-shape match
// that consumed the ENTIRE top-level rendering (see renderCapture's doc comment for the nested-leaf
// boundary); the caller ORs it with the name axis into ParameterCapture.redacted.
function renderCaptureValue(
  arg: unknown,
  nameAxisRedacted: boolean,
  captureValues: boolean,
): { value: string; shapeRedacted: boolean } {
  if (!captureValues) return { value: "", shapeRedacted: false };
  if (nameAxisRedacted) return { value: RedactionPolicy.MARKER, shapeRedacted: false };
  const { rendered, shapeRedacted } = renderCapture(arg);
  return { value: rendered, shapeRedacted };
}

// Values for template substitution: a redacted parameter resolves to the marker so a secret
// cannot leak through a narration/error template even though the raw arg is available here.
function buildValueMap(
  args: unknown[],
  names: string[] | undefined,
  redactedFlags: readonly boolean[],
): Record<string, unknown> {
  const values: Record<string, unknown> = {};
  args.forEach((arg, i) => {
    values[paramName(names, i)] = redactedFlags[i] ? RedactionPolicy.MARKER : arg;
  });
  return values;
}

function buildMethodOptions(
  fn: AnyFn,
  values: Record<string, unknown>,
  cfg: MethodTraceConfig | undefined,
) {
  const rawNarration = cfg?.narration ?? getNarration(fn);
  if (rawNarration === undefined) return undefined;
  return { narration: resolveTemplate(rawNarration, values) };
}

// @onError/config error context resolves at throw time against the actual thrown type, choosing
// the most specific matching declaration (Java resolveErrorContext / findMostSpecificOnError).
function resolveErrorContext(
  fn: AnyFn,
  cfg: MethodTraceConfig | undefined,
  values: Record<string, unknown>,
  error: unknown,
): string | null {
  const match = findMostSpecific(effectiveErrorSpecs(fn, cfg), error);
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
  methods?: Record<string, MethodTraceConfig>;
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
  const cfg = config.methods?.[methodName];
  const names = resolveNames(fn, cfg?.params ?? config.paramNames?.[methodName]);
  const annotatedIndices = resolveRedacted(fn, cfg);
  const redactedFlags = resolveRedactedFlags(args, names, annotatedIndices);
  const values = buildValueMap(args, names, redactedFlags);
  const captures = buildCaptures(
    args,
    names,
    redactedFlags,
    config.context.capturesParameterValues,
  );
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
    const cfg = config.methods?.[methodName];
    const { captures, values } = buildEntryCaptures(fn, methodName, args, config);
    const handle = config.context.enterMethod(
      config.className,
      methodName,
      captures,
      buildMethodOptions(fn, values, cfg),
    );
    return { handle, onError: (error) => resolveErrorContext(fn, cfg, values, error) };
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
    ...(options?.methods !== undefined && { methods: options.methods }),
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

type WrapperCacheEntry = { fn: AnyFn; wrapped: AnyFn };

// Wrapper cache, keyed by property and validated against the current method identity: every call
// site performs one `get` per call, so without a cache each call allocates a fresh closure — a
// per-call cost that would survive even with tracing off. The cache makes the disabled path
// allocation-free and gives `traced.method` a stable identity; a monkey-patched method fails the
// identity check and is re-wrapped, so a stale wrapper can never call a replaced function.
function createTracingHandler<T extends object>(config: TracingConfig): ProxyHandler<T> {
  const wrappers = new Map<string | symbol, WrapperCacheEntry>();
  return {
    get(obj, prop, receiver) {
      const value = Reflect.get(obj, prop, receiver);
      if (typeof value !== "function") return value;
      const cached = wrappers.get(prop);
      if (cached && cached.fn === value) return cached.wrapped;
      if (isGetterProperty(obj, prop) || ORDINARY_OBJECT_OPS.has(prop)) return value;
      const wrapped = wrapMethod(value as AnyFn, obj, String(prop), config) as AnyFn;
      wrappers.set(prop, { fn: value as AnyFn, wrapped });
      return wrapped;
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
 * @remarks **Target-binding trade (by design):** traced methods run with `this` bound to the
 * raw target, not the proxy (`invokeTarget` → `Reflect.apply(fn, obj, args)`), so a method
 * calling a sibling on the same object runs correctly but is not captured — self-calls never
 * nest. In exchange the proxy is immune to the classic Proxy landmines: `#private` fields,
 * built-ins with internal slots (`Map`, `Date`), and arrow-function fields. Nesting comes from
 * wrapping collaborators, not from rebinding `this`: decompose into collaborator services, wrap
 * each where it is constructed. (Same statement in README.md § FAQ and
 * documentation/decorators-guide.md.)
 *
 * @remarks **Disabled cost:** wrapping `NOOP_CONTEXT` returns `target` itself — zero wrap, zero
 * per-call cost. For a live context at level `"off"`, the proxy stays (the level can flip at
 * runtime) but a call does no capture work at all: one cached-wrapper lookup and the `isActive`
 * check, no allocation, no metadata reads, no rendering — and a method reference captured while
 * off starts tracing the moment the level turns on, because the check runs per call.
 *
 * @param target the object to trace; the returned proxy has the same type `T`.
 * @param context sink and gate for spans — when `context.isActive` is false the proxy invokes
 * the target with zero capture work, so an inactive context has no rendering cost.
 * @param paramNames optional per-method parameter names (keyed by method name), the shorthand
 * config twin of `@traced`; falls back to `arg0`, `arg1`, … otherwise. The third argument also
 * accepts {@link ProxyOptions} directly, so the full config form needs no placeholder:
 * `traceObject(target, context, { methods: { charge: { params, narration, onError, notTraced } } })`.
 * @param options see {@link ProxyOptions} — per-method trace config ({@link MethodTraceConfig},
 * the config twin of all four decorators), class-name override, return-capture switch.
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
  options?: ProxyOptions,
): T;
/**
 * Shorthand overload: the third argument is a bare per-method parameter-name map (the config
 * twin of `@traced` alone), with {@link ProxyOptions} still available fourth.
 */
export function traceObject<T extends object>(
  target: T,
  context: NarrativeContext,
  paramNames?: Record<string, string[]>,
  options?: ProxyOptions,
): T;
/**
 * Implementation signature: the third argument routes to whichever overload shape it carries —
 * see `splitWrapArguments`.
 */
export function traceObject<T extends object>(
  target: T,
  context: NarrativeContext,
  namesOrOptions?: Record<string, string[]> | ProxyOptions,
  options?: ProxyOptions,
): T {
  // NOOP_CONTEXT is permanently inactive by contract, so wrapping would buy nothing but a proxy
  // hop on every call — the disabled-cost story for the null context is exact: the same object.
  if (context === NOOP_CONTEXT) return target;
  const [paramNames, resolvedOptions] = splitWrapArguments(namesOrOptions, options);
  return new Proxy(
    target,
    createTracingHandler(buildTracingConfig(target, context, paramNames, resolvedOptions)),
  );
}

const PROXY_OPTION_KEYS = ["className", "includeReturnValues", "methods"] as const;

// A paramNames map's values are always arrays of names; ProxyOptions' distinguishing keys never
// hold arrays — so a method that happens to be *named* like an option key still routes correctly.
function isProxyOptions(value: Record<string, string[]> | ProxyOptions): value is ProxyOptions {
  return PROXY_OPTION_KEYS.some(
    (key) => key in value && !Array.isArray((value as Record<string, unknown>)[key]),
  );
}

function splitWrapArguments(
  third: Record<string, string[]> | ProxyOptions | undefined,
  fourth: ProxyOptions | undefined,
): [Record<string, string[]> | undefined, ProxyOptions | undefined] {
  if (third !== undefined && isProxyOptions(third)) return [undefined, third];
  return [third as Record<string, string[]> | undefined, fourth];
}
