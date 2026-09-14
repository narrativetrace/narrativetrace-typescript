// SPDX-License-Identifier: BUSL-1.1
// Licensed under the Business Source License 1.1 (see LICENSE); Change Date: four years from publication; Change License: Apache-2.0
// Copyright (c) 2026 Empower Agile
import { ControlEscape } from "./control-escape.js";
import { errorTypeName } from "./error-display.js";
import { isThenable } from "./is-thenable.js";
import { notTracedFields, RedactionPolicy } from "./redaction-policy.js";

/**
 * The typed error marker: a member that throws while `renderValue`/`renderStructured` reads it
 * (`narrativeSummary()`, a leaf's `toString()`, a field getter) never shows past the thrower's
 * TYPE name — never {@link Error.message}, which can carry the exact value the member was
 * refusing to render (owner ruling, 2026-09-11). {@link errorTypeName} already resolves the
 * cross-runtime name (constructor name for an `Error`/object, `typeof` for a thrown primitive)
 * and sanitizes it, so this is the one place every throwing hazard in the renderer converges on.
 */
function errorMarker(thrown: unknown): string {
  return `<error: ${errorTypeName(thrown)}>`;
}

/**
 * Truncation and redaction budgets for {@link renderValue}. Omitted fields fall back to conservative
 * defaults (200-char strings, 5 array/object/collection items, {@link RedactionPolicy.DEFAULT}).
 *
 * INTENT: pass this to cap how much of a captured value ends up in a trace and to steer which keys
 * are masked.
 *
 * @llmNote Rendering a captured value may invoke members on the argument/return object — a custom
 * `toString()`, a `@narrativeSummary` method, or any property path named in a `@narrated`/`@onError`
 * template. Those members must be side-effect free (no lazy loading, counters, caches, or I/O).
 * Every invocation is bounded by these budgets and exception-isolated; with tracing off nothing is
 * touched. Redact members you cannot make pure via `@notTraced` / `static notTraced`. (This is the
 * purity contract — see README.md and documentation/decorators-guide.md.)
 * @remarks Edge case: an accessor on an object literal is own-enumerable and *will* run during
 * introspection — prefer class getters or list the field in `static notTraced`.
 */
export interface RenderOptions {
  readonly maxStringLength?: number;
  readonly maxArrayItems?: number;
  readonly maxObjectKeys?: number;
  readonly maxCollectionItems?: number;
  readonly redactionPolicy?: RedactionPolicy;
}

const DEFAULTS: Required<RenderOptions> = {
  maxStringLength: 200,
  maxArrayItems: 5,
  maxObjectKeys: 5,
  maxCollectionItems: 5,
  redactionPolicy: RedactionPolicy.DEFAULT,
};

/**
 * How many levels of nested complex value {@link renderValue} will follow before it stops and
 * renders `<max-depth>` instead of descending further.
 *
 * @remarks The cycle guard alone does not bound a walk: a linked list, a parent-child tree, or a
 * JSON document mapped to nested objects is arbitrarily deep while repeating no object, so it never
 * trips `RenderWalk`'s ancestor check. Following one recursively without a limit risks a
 * `RangeError: Maximum call stack size exceeded` raised *inside instrumentation* — an
 * observability failure becoming an application failure, which the pipeline contract forbids, and
 * (worse) at a depth that varies run to run with however much of the call stack happened to be
 * free, which is what made an un-capped deep chain non-idempotent. 32 is chosen the way the other
 * three caps are: with five collection items and five object fields per level, a depth-32 walk can
 * already visit more nodes than any narrative is readable at, and real DTO graphs are single digits
 * deep — this cap exists for the shapes the other three don't reach, cyclic-*shaped* but not
 * cyclic data the ancestor guard cannot see.
 */
const MAX_DEPTH = 32;

/**
 * Where {@link render} currently is inside one object graph: the ancestors on the path it is
 * walking (for the `<circular>` cycle guard) and how deep that path has gone (for the `<max-depth>`
 * cap). Both answer "may I follow this reference?" and both are threaded through every recursive
 * call as a single parameter, so adding the depth cap was a change to one carrier rather than to
 * every function's signature.
 */
class RenderWalk {
  private readonly ancestors = new Set<object>();
  private depth = 0;

  /** Whether `value` is already an ancestor of the current path — a cycle, not a chain. */
  has(value: object): boolean {
    return this.ancestors.has(value);
  }

  /** Records `value` as an ancestor of the current path. */
  add(value: object): void {
    this.ancestors.add(value);
  }

  /** Drops `value` from the path, on the way back out — a value reached again by a different,
   * non-overlapping path is shared, not cyclic, and must not render `<circular>`. */
  remove(value: object): void {
    this.ancestors.delete(value);
  }

  /**
   * Takes one step down.
   *
   * @returns whether the step was allowed; `false` means the caller must render `<max-depth>`
   * instead of descending, and must not call {@link ascend}.
   */
  descend(): boolean {
    if (this.depth >= MAX_DEPTH) return false;
    this.depth++;
    return true;
  }

  /** Takes one step back up. Always paired with a {@link descend} that returned `true`. */
  ascend(): void {
    this.depth--;
  }
}

/**
 * Renders any captured value to a single compact, human-readable string for a trace line, applying
 * truncation, cycle detection (`<circular>`), a depth cap (`<max-depth>`), and key redaction.
 * Dispatch order mirrors the Java `ValueRenderer`: array/Set/Map, then `@narrativeSummary`, then a
 * custom native stringification (realm platform intrinsics only, e.g. `Date`/`URL`/`RegExp`/typed
 * arrays — see `isPlatformValue`; `Date` renders via `toISOString()`, every other intrinsic via
 * `toString()` — see `nativeStringMethod`), then field introspection.
 *
 * @param value any argument or return value, including `null`/`undefined` (rendered literally) and
 * cyclic structures.
 * @param options truncation and redaction budgets; see {@link RenderOptions} for defaults.
 * @returns the rendered string; thenables render as `<pending>` (never awaited) and a member that
 * throws while being rendered (`narrativeSummary()`, a leaf's `toString()`, a field getter)
 * degrades to the typed error marker `<error: TypeName>` for that part alone.
 * @llmNote Rendering may invoke members on `value` — a custom `toString()`, a `@narrativeSummary`
 * method, or a property path named in a `@narrated`/`@onError` template — so those members must be
 * side-effect free (no lazy loading, counters, caches, or I/O). Every invocation is bounded and
 * exception-isolated; with tracing off nothing is touched. Redact members you cannot make pure via
 * `@notTraced` / `static notTraced`. (This is the purity contract — see README.md and
 * documentation/decorators-guide.md.)
 */
export function renderValue(value: unknown, options?: RenderOptions): string {
  const opts = { ...DEFAULTS, ...options };
  return render(value, opts, new RenderWalk());
}

/**
 * Capture-oriented twin of {@link renderValue} that also reports whether the TOP-LEVEL value's
 * shape (not a nested leaf's) was the reason its entire rendering is the redaction marker.
 *
 * INTENT: a capture site needs to flip its `ParameterCapture.redacted` boolean when the
 * value-shape axis alone (no field name involved) redacted the whole parameter — see
 * `RedactionPolicy.shouldRedactValue` and the family-wide ruling that `redacted === true` iff the
 * parameter's WHOLE value was withheld. Only a top-level scalar string can make that true: a JWT
 * nested inside an object's field is masked in the rendered text by the same
 * `shouldRedactValue` check ({@link renderString}), but the parameter still carries other,
 * unredacted content, so `shapeRedacted` stays `false` for it — the flag is per-parameter, shape
 * matches are per-leaf. `renderValue` itself is left untouched for every other caller: this reuses
 * the identical shape check exactly once, so the seam costs nothing beyond the boolean already
 * being computed.
 *
 * @param value the top-level argument or return value being captured.
 * @param options same truncation/redaction budgets as {@link renderValue}.
 * @returns `rendered`, identical to what `renderValue(value, options)` would produce, and
 * `shapeRedacted`, true only when `value` is itself a string whose shape matched.
 */
export function renderCapture(
  value: unknown,
  options?: RenderOptions,
): { readonly rendered: string; readonly shapeRedacted: boolean } {
  const opts = { ...DEFAULTS, ...options };
  if (typeof value === "string") return renderStringResult(value, opts);
  return { rendered: render(value, opts, new RenderWalk()), shapeRedacted: false };
}

type TypeRenderer = (value: any, opts: Required<RenderOptions>, walk: RenderWalk) => string;

const TYPE_RENDERERS: Record<string, TypeRenderer> = {
  string: (v, opts) => renderString(v, opts),
  number: (v) => String(v),
  boolean: (v) => String(v),
  bigint: (v) => `${v}n`,
  symbol: (v, opts) => renderSymbol(v, opts),
  function: () => "<function>",
  object: (v, opts, walk) => renderObject(v, opts, walk),
};

function render(value: unknown, opts: Required<RenderOptions>, walk: RenderWalk): string {
  if (value == null) return String(value);
  // After null guard, typeof is one of: string, number, bigint, boolean, symbol, function, object
  // All have entries in TYPE_RENDERERS — assertion avoids untestable fallback branch
  const renderer = TYPE_RENDERERS[typeof value] as TypeRenderer;
  return renderer(value, opts, walk);
}

function truncate(value: string, maxLength: number): string {
  return value.length > maxLength ? `${value.slice(0, maxLength)}…` : value;
}

/** The shared safe-text tail: control escape, then the string cap. {@link renderString} and
 * {@link renderNarrationText} must keep reading this same line — a secret must not depend on
 * whether the value was captured or narrated. */
function sanitizeAndCap(text: string, maxStringLength: number): string {
  return truncate(ControlEscape.sanitize(text), maxStringLength);
}

// Value-shape masking (RedactionPolicy.shouldRedactValue) is a second, independent redaction axis
// from field-name matching — checked here so every scalar string reaches it regardless of whether
// it arrived as a top-level value, an array/Set item, an unredacted Map value, or an
// ordinarily-named object field (every one of those paths dispatches through here). Returns
// `shapeRedacted` alongside the rendered form so {@link renderCapture} can expose the same
// decision at the top level without a second `shouldRedactValue` call; `renderString` below is the
// existing narrower view every other caller (nested leaves included) keeps using.
function renderStringResult(
  value: string,
  opts: Required<RenderOptions>,
): { readonly rendered: string; readonly shapeRedacted: boolean } {
  if (opts.redactionPolicy.shouldRedactValue(value)) {
    return { rendered: RedactionPolicy.MARKER, shapeRedacted: true };
  }
  return { rendered: `"${sanitizeAndCap(value, opts.maxStringLength)}"`, shapeRedacted: false };
}

function renderString(value: string, opts: Required<RenderOptions>): string {
  return renderStringResult(value, opts).rendered;
}

/**
 * Renders text that is substituted into prose rather than shown as a value: the same decision
 * {@link renderValue} makes for a string, without the quotation marks.
 *
 * INTENT: `@narrated("issued {token}")` writes its placeholder into a sentence, where a quoted,
 * escaped value would read as a rendering artifact — but the sentence is an output like any other,
 * so the value in it must obey the same rules. Both axes apply here: the value-shape axis of
 * {@link RedactionPolicy.shouldRedactValue} (a JWT is a JWT wherever it is printed), the
 * control-character escape, and the string cap. Only the quotes are dropped.
 *
 * @llmNote The one caller is `template-parser.ts`, which used to answer a text placeholder with
 * `String(value)` — no redaction, no escaping, no cap — so `@narrated("issued {token}")` printed a
 * bearer token that the identical value answered `[REDACTED]` for as a captured parameter
 * (2026-09-04, family security fix). Keep this function and {@link renderString} reading the same
 * two lines: a secret must not depend on whether the value was narrated or captured.
 *
 * @param text any string destined for narration.
 * @param options truncation and redaction budgets; see {@link RenderOptions} for defaults.
 * @returns the redaction marker, or the sanitized and capped text, unquoted.
 */
export function renderNarrationText(text: string, options?: RenderOptions): string {
  const opts = { ...DEFAULTS, ...options };
  if (opts.redactionPolicy.shouldRedactValue(text)) return RedactionPolicy.MARKER;
  return sanitizeAndCap(text, opts.maxStringLength);
}

// A symbol's description is caller-supplied text (`Symbol(userInput)`), unlike number/bigint/
// boolean whose string form can never carry arbitrary content — the one JDK-numeric-shaped fast
// path here an attacker actually controls, so it gets the same sanitize + truncate treatment as a
// string rather than a raw, unescaped `toString()`.
function renderSymbol(value: symbol, opts: Required<RenderOptions>): string {
  const description = truncate(
    ControlEscape.sanitize(value.description ?? ""),
    opts.maxStringLength,
  );
  return `Symbol(${description})`;
}

function typeName(value: object): string {
  return value.constructor?.name ?? "Object";
}

// A `narrativeSummary()` method (no args) supplies a curated one-line summary that is preferred
// over field introspection / toString (Java @NarrativeSummary), and — like every other member
// this renderer invokes — is scanned for a value shape (JWT/PAN/SSN/…) as defense-in-depth: the
// method is the author's own curated text, but curated text can still accidentally interpolate a
// secret-shaped value the same way a hostile toString does. A throwing summary is NOT ignored:
// the owner ruling is that the whole rendering degrades to the typed error marker rather than
// silently falling through to toString/field introspection, which could reintroduce exactly the
// leak a summary method was written to prevent. Returns undefined only when there is no
// `narrativeSummary` method at all, so dispatch can fall through to the next rule.
function renderSummary(value: object, opts: Required<RenderOptions>): string | undefined {
  const fn = (value as { narrativeSummary?: unknown }).narrativeSummary;
  if (typeof fn !== "function") return undefined;
  try {
    const text = String(fn.call(value));
    if (opts.redactionPolicy.shouldRedactValue(text)) return RedactionPolicy.MARKER;
    return truncate(ControlEscape.sanitize(text), opts.maxStringLength);
  } catch (err) {
    return errorMarker(err);
  }
}

function hasCustomToString(value: object): boolean {
  const fn = (value as { toString?: unknown }).toString;
  return typeof fn === "function" && fn !== Object.prototype.toString;
}

/**
 * The realm intrinsic prototypes {@link isPlatformValue} trusts native stringification for (owner
 * ruling, 2026-09-12 "trusted-leaf" carve-out). `Map`/`Set` are deliberately absent: `dispatchObject`
 * routes both to their own renderer before this check is ever consulted, so they never reach here.
 *
 * @remarks `Error` is deliberately NOT included, despite being a realm intrinsic. Every other entry
 * here stringifies opaque, platform-managed internal state (`Date`'s numeric timestamp, `URL`'s
 * parsed components, `RegExp`'s pattern, a typed array's numeric buffer) that cannot itself embed a
 * caller-named secret. `Error.prototype.toString()` instead interpolates `message` — free text the
 * caller supplies at construction (`new Error(user.password)`) — exactly the shape a deny-listed
 * field exists to catch, so trusting it here would hand back a way to smuggle a secret past both
 * this renderer's redaction axes at once.
 */
// `URL` is a WHATWG/Node global, not an ECMAScript one — this package's `lib` is ES2022 only, kept
// lean on purpose so its compiled types never assume a DOM or Node ambient (see tsconfig.json), so
// there is no type for a bare `URL` reference here. Resolved dynamically instead, purely for its
// `prototype` object's identity, and left out of the set entirely on a runtime with no URL global
// at all (no false negative: nothing else on this list is ever a URL, so omitting it only means
// this one intrinsic falls back to a field walk there instead of a short value).
const urlCtor = (globalThis as { URL?: { readonly prototype: unknown } }).URL;

const PLATFORM_PROTOTYPES: ReadonlySet<unknown> = new Set<unknown>(
  [
    Date.prototype,
    urlCtor?.prototype,
    RegExp.prototype,
    BigInt.prototype,
    Int8Array.prototype,
    Uint8Array.prototype,
    Uint8ClampedArray.prototype,
    Int16Array.prototype,
    Uint16Array.prototype,
    Int32Array.prototype,
    Uint32Array.prototype,
    Float32Array.prototype,
    Float64Array.prototype,
    BigInt64Array.prototype,
    BigUint64Array.prototype,
  ].filter((prototype): prototype is object => prototype !== undefined),
);

/**
 * Whether `value` IS, by identity, one of the realm's platform-defined intrinsics this renderer
 * trusts native stringification for.
 *
 * @remarks Owner ruling, 2026-09-12: after the 2026-09-11 fix (trust `toString()` only for a
 * leaf — no own enumerable key), a field-less user class was STILL trusted merely for having
 * nothing `Object.keys` could see — but "no own enumerable key" was never proof of "nothing to
 * hide" the way it looked: a true `#private` class field, a closure variable, or a module-level
 * `WeakMap` keyed by `this` are all invisible to `Object.keys` yet freely readable from inside the
 * class's own `toString()`. That is a strictly JS-shaped hole the 2026-09-11 fix didn't close, and
 * closing it means narrowing trust from "any leaf" to "a leaf this library itself ships and can
 * vouch for" — a realm intrinsic, checked by IDENTITY.
 *
 * The check is `Object.getPrototypeOf(value) === <Intrinsic>.prototype`, never
 * `value.constructor?.name` or any other name-based test: a user class can freely name itself
 * `Date` (`platform-lookalike-walked` in the hostile corpus) without ever touching
 * `Date.prototype`, and a subclass's instances have the SUBCLASS's prototype one level up, not the
 * base intrinsic's (`platform-subclass-walked`) — `class Foo extends Date {}` fails this check for
 * every one of its instances, exactly as it must: the most-derived type is what decides trust, and
 * a subclass is never trusted merely because its superclass is.
 */
function isPlatformValue(value: object): boolean {
  return PLATFORM_PROTOTYPES.has(Object.getPrototypeOf(value));
}

/**
 * The member that produces a trusted platform value's native string form: `toString()` for every
 * intrinsic in {@link PLATFORM_PROTOTYPES} except `Date`, which uses `toISOString()` instead
 * (owner ruling, 2026-09-13). `Date.prototype.toString()` bakes the host's locale and timezone
 * NAME into the string (`"Tue Jan 01 2024 01:00:00 GMT+0100 (Central European Standard Time)"`) —
 * two machines (or the same machine at a different `TZ`) render two different strings for the
 * identical instant, which is exactly what a reproducible trace artifact must never do.
 * `toISOString()` is UTC and has neither axis: one instant, one string, everywhere. Invoked as an
 * own-property lookup on `value`, never a bare `Date.prototype.toISOString.call(value)` — an
 * overridden own method still runs, same as `toString()` does for every other platform value,
 * so the degrade paths below (null return, throw, sanitize) exercise identically for Date.
 */
function nativeStringMethod(value: object): "toString" | "toISOString" {
  return Object.getPrototypeOf(value) === Date.prototype ? "toISOString" : "toString";
}

// An object with its own toString() (or, for a Date, toISOString() — see nativeStringMethod)
// renders that string (sanitized + truncated) rather than a field dump; a null return falls back
// to <TypeName>, a throw to the typed error marker (Java renderWithToString). Plain objects
// (Object.prototype.toString) still introspect. Only ever called for a platform value (see
// dispatchObject) — every other object, leaf or not, always field-walks instead (2026-09-12
// ruling — see isPlatformValue).
function renderWithToString(value: object, opts: Required<RenderOptions>): string {
  try {
    const method = nativeStringMethod(value);
    if (method === "toISOString" && Number.isNaN((value as Date).getTime())) {
      // An invalid Date's toISOString() throws RangeError; its toString() already returns the
      // literal "Invalid Date" without throwing, and this keeps that literal unchanged rather
      // than routing an invalid timestamp through the typed error marker.
      return "Invalid Date";
    }
    const raw = (value as { toISOString(): unknown; toString(): unknown })[method]();
    if (raw == null) return `<${typeName(value)}>`;
    return truncate(ControlEscape.sanitize(String(raw)), opts.maxStringLength);
  } catch (err) {
    return errorMarker(err);
  }
}

function renderObject(value: object, opts: Required<RenderOptions>, walk: RenderWalk): string {
  if (isThenable(value)) return "<pending>";
  if (walk.has(value)) return "<circular>";
  if (!walk.descend()) return "<max-depth>";
  walk.add(value);
  try {
    return dispatchObject(value, opts, walk);
  } catch (err) {
    return errorMarker(err);
  } finally {
    walk.ascend();
    walk.remove(value);
  }
}

// Render order mirrors Java ValueRenderer: Array, Set, Map, @narrativeSummary, custom toString
// (realm platform intrinsics only — see isPlatformValue), then field introspection. A custom
// toString() on any object that is NOT a platform value is never trusted, fields or not — see
// isPlatformValue's doc for the private-field/closure leak this closes.
function dispatchObject(value: object, opts: Required<RenderOptions>, walk: RenderWalk): string {
  if (Array.isArray(value)) return renderArray(value, opts, walk);
  if (value instanceof Set) return renderSet(value, opts, walk);
  if (value instanceof Map) return renderMap(value, opts, walk);
  const summary = renderSummary(value, opts);
  if (summary !== undefined) return summary;
  if (hasCustomToString(value) && isPlatformValue(value)) {
    return renderWithToString(value, opts);
  }
  return renderPlainObject(value, opts, walk);
}

function renderSet(value: Set<unknown>, opts: Required<RenderOptions>, walk: RenderWalk): string {
  const members = [...value];
  const items = members.slice(0, opts.maxCollectionItems).map((v) => render(v, opts, walk));
  if (members.length > opts.maxCollectionItems) {
    items.push(`… (${members.length} total)`);
  }
  return `[${items.join(", ")}]`;
}

function renderMap(
  value: Map<unknown, unknown>,
  opts: Required<RenderOptions>,
  walk: RenderWalk,
): string {
  const entries = [...value.entries()];
  const shown = entries
    .slice(0, opts.maxCollectionItems)
    .map(([k, v]) => renderMapEntry(k, v, opts, walk));
  const joined = shown.join(", ");
  return entries.length > opts.maxCollectionItems ? `{${joined}, …}` : `{${joined}}`;
}

// A Map key can be an arbitrary object — including one carrying a redacted field, or one whose
// own toString() is the exact private-state hazard `isPlatformValue` guards against — so the key is
// rendered through the same total, redaction-aware `render()` every value goes through, never via
// a raw `String(key)` (2026-09-11 family security fix: `String(key)` on an object silently calls
// its toString() unconditionally, bypassing dispatch entirely). The "does this key's NAME look
// like a secret" check that decides whether to redact the associated VALUE stays scoped to
// string keys only — the common `Map<string, T>` shape it exists for — rather than reaching for
// an object key's rendered text, which is display output, not a field name to pattern-match.
function renderMapEntry(
  key: unknown,
  value: unknown,
  opts: Required<RenderOptions>,
  walk: RenderWalk,
): string {
  const keyText = renderMapKey(key, opts, walk);
  const nameRedactsValue = typeof key === "string" && opts.redactionPolicy.shouldRedact(key);
  const rendered = nameRedactsValue ? RedactionPolicy.MARKER : render(value, opts, walk);
  return `${keyText}=${rendered}`;
}

// Objects and symbols can carry hostile or secret-shaped content reachable only through the safe
// `render()` dispatch (field introspection, redaction, sanitizing). A string key is data too — the
// common `Map<string, T>` shape this function exists for is exactly how a caller indexes metadata
// by credential — so it honours the same value-shape axis (`shouldRedactValue`) every scalar string
// value goes through before falling back to the plain, unquoted key form (ADV-2026-09-14-1: a
// string key used to skip straight to `String(key)`, never asking the shape check at all). Every
// other key type's string form can never carry arbitrary text, so it keeps that bare `String(key)`
// display this renderer has always used.
function renderMapKey(key: unknown, opts: Required<RenderOptions>, walk: RenderWalk): string {
  if (key !== null && (typeof key === "object" || typeof key === "symbol")) {
    return render(key, opts, walk);
  }
  if (typeof key === "string") {
    if (opts.redactionPolicy.shouldRedactValue(key)) return RedactionPolicy.MARKER;
    return sanitizeAndCap(key, opts.maxStringLength);
  }
  return String(key);
}

function renderArray(value: unknown[], opts: Required<RenderOptions>, walk: RenderWalk): string {
  const items = value.slice(0, opts.maxArrayItems).map((item) => render(item, opts, walk));
  if (value.length > opts.maxArrayItems) {
    items.push(`... (${value.length} total)`);
  }
  return `[${items.join(", ")}]`;
}

function renderPlainObject(value: object, opts: Required<RenderOptions>, walk: RenderWalk): string {
  const keys = Object.keys(value);
  const explicit = notTracedFields(value);
  const entries = keys
    .slice(0, opts.maxObjectKeys)
    .map((key) => renderEntry(value, key, explicit, opts, walk));
  if (keys.length > opts.maxObjectKeys) {
    entries.push(`... (${keys.length} total)`);
  }
  return `{${entries.join(", ")}}`;
}

function renderEntry(
  value: object,
  key: string,
  explicit: ReadonlySet<string>,
  opts: Required<RenderOptions>,
  walk: RenderWalk,
): string {
  // Explicit annotation (static `notTraced` class field) redacts independently of the policy,
  // so it beats even RedactionPolicy.DISABLED (Java: the annotation branch is independent of
  // shouldRedact).
  if (opts.redactionPolicy.isRedacted(key, explicit.has(key))) {
    return `"${key}": ${RedactionPolicy.MARKER}`;
  }
  return `"${key}": ${renderFieldValue(value, key, opts, walk)}`;
}

// A field can be a getter that throws while being read (own-enumerable accessors are the one
// shape the renderer's introspection actually invokes — see the RenderOptions remarks). That
// throw is scoped to this one field: siblings still render normally, and the failing field shows
// the typed error marker rather than losing the whole object to a single hostile getter.
function renderFieldValue(
  value: object,
  key: string,
  opts: Required<RenderOptions>,
  walk: RenderWalk,
): string {
  try {
    return render((value as Record<string, unknown>)[key], opts, walk);
  } catch (err) {
    return errorMarker(err);
  }
}
