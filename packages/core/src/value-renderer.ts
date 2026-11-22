// SPDX-License-Identifier: BUSL-1.1
// Licensed under the Business Source License 1.1 (see LICENSE); Change Date: four years from publication; Change License: Apache-2.0
// Copyright (c) 2026 Empower Agile
import { ControlEscape } from "./control-escape.js";
import { declaredElements, elementOrigin, platformMembers } from "./element-origin.js";
import { errorTypeName } from "./error-display.js";
import { INACCESSIBLE, readOwnField } from "./field-read.js";
import { isThenable } from "./is-thenable.js";
import { notTracedFields, numberText, RedactionPolicy } from "./redaction-policy.js";
import { clampLimits } from "./render-limits.js";
import { RenderWalk, repeatMarker, TOO_MANY } from "./render-walk.js";
import { withRenderingGuard } from "./rendering-guard.js";

/**
 * The typed error marker: a member that throws while `renderValue`/`renderStructured` reads it
 * (`narrativeSummary()`, a leaf's `toString()`, a field getter) never shows past the thrower's
 * TYPE name — never {@link Error.message}, which can carry the exact value the member was
 * refusing to render. {@link errorTypeName} already resolves the
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
 * @remarks Limits contract (B-207): a limit is a size, so one below zero is clamped to `0` -- never
 * trusted as "all but the last" -- with one `console.warn` line naming each limit clamped.
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

const LIMIT_OPTIONS = [
  "maxStringLength",
  "maxArrayItems",
  "maxObjectKeys",
  "maxCollectionItems",
] as const;

/** The options merged over the defaults, every limit below zero clamped to zero (B-207). */
function resolveOptions(options: RenderOptions | undefined): Required<RenderOptions> {
  return clampLimits({ ...DEFAULTS, ...options }, LIMIT_OPTIONS);
}

/**
 * Renders any captured value to a single compact, human-readable string for a trace line, applying
 * truncation, cycle detection (`<circular>`), a depth cap (`<max-depth>`), and key redaction.
 * Dispatch order is the family's: array/Set/Map, then `@narrativeSummary`, then a
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
  const opts = resolveOptions(options);
  return withRenderingGuard(() => renderRoot(value, opts, new RenderWalk()));
}

/**
 * Capture-oriented twin of {@link renderValue} that also reports whether the TOP-LEVEL value's
 * shape (not a nested leaf's) was the reason its entire rendering is the redaction marker.
 *
 * INTENT: a capture site needs to flip its `ParameterCapture.redacted` boolean when the
 * value-shape axis alone (no field name involved) redacted the whole parameter — see
 * `RedactionPolicy.shouldRedactValue`; `redacted === true` iff the
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
  const opts = resolveOptions(options);
  return withRenderingGuard(() => {
    if (typeof value === "string") return renderStringResult(value, opts);
    return { rendered: renderRoot(value, opts, new RenderWalk()), shapeRedacted: false };
  });
}

type TypeRenderer = (value: any, opts: Required<RenderOptions>, walk: RenderWalk) => string;

const TYPE_RENDERERS: Record<string, TypeRenderer> = {
  string: (v, opts) => renderString(v, opts),
  number: (v, opts) => numberText(v, opts.redactionPolicy),
  boolean: (v) => String(v),
  bigint: (v, opts) => numberText(v, opts.redactionPolicy, "n"),
  symbol: (v, opts) => renderSymbol(v, opts),
  function: () => "<function>",
  object: (v, opts, walk) => renderObject(v, opts, walk),
};

/**
 * One nested value: counted against the walk's total budget first, then rendered. The count comes
 * before any scalar/complex split on purpose — the flat and structured paths classify a few leaves
 * differently, and counting every value rendered keeps their budgets identical (B-185).
 */
function render(value: unknown, opts: Required<RenderOptions>, walk: RenderWalk): string {
  if (!walk.count()) return TOO_MANY;
  return renderRoot(value, opts, walk);
}

/** The walk's entry: the root is not counted, only the values nested under it. */
function renderRoot(value: unknown, opts: Required<RenderOptions>, walk: RenderWalk): string {
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

/** The shared leaf ladder: text a leaf produced through its own string conversion
 * is checked by SHAPE on the raw text first (a card number, token, JWT or secret is replaced whole
 * by the marker), else control-escaped, then capped. {@link renderWithToString}, {@link invokeSummary},
 * {@link renderSymbol}, {@link renderNarrationText} and a string map key all read this one line, so
 * no leaf text reaches the output without the value-shape axis (B-206). */
function scanned(text: string, opts: Required<RenderOptions>): string {
  if (opts.redactionPolicy.shouldRedactValue(text)) return RedactionPolicy.MARKER;
  return sanitizeAndCap(text, opts.maxStringLength);
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
 * @llmNote The one caller is `template-parser.ts`. A text placeholder answered with plain
 * `String(value)` — no redaction, no escaping, no cap — would let `@narrated("issued {token}")`
 * print a bearer token that the identical value answers `[REDACTED]` for as a captured parameter.
 * Keep this function and {@link renderString} reading the same two lines: a secret must not
 * depend on whether the value was narrated or captured.
 *
 * @param text any string destined for narration.
 * @param options truncation and redaction budgets; see {@link RenderOptions} for defaults.
 * @returns the redaction marker, or the sanitized and capped text, unquoted.
 */
export function renderNarrationText(text: string, options?: RenderOptions): string {
  const opts = resolveOptions(options);
  return scanned(text, opts);
}

// A symbol's description is caller-supplied text (`Symbol(userInput)`), unlike number/bigint/
// boolean whose string form can never carry arbitrary content — the one JDK-numeric-shaped fast
// path here an attacker actually controls, so it gets the same sanitize + truncate treatment as a
// string rather than a raw, unescaped `toString()`.
function renderSymbol(value: symbol, opts: Required<RenderOptions>): string {
  return `Symbol(${scanned(value.description ?? "", opts)})`;
}

function typeName(value: object): string {
  return errorTypeName(value);
}

// A `narrativeSummary()` method (no args) supplies a curated one-line summary that is preferred
// over field introspection / toString and — like every other member
// this renderer invokes — is scanned for a value shape (JWT/PAN/SSN/…) as defense-in-depth: the
// method is the author's own curated text, but curated text can still accidentally interpolate a
// secret-shaped value the same way a hostile toString does. A throwing summary is NOT ignored:
// rendering degrades to the typed error marker rather than silently falling through to
// toString/field introspection, which could reintroduce exactly the leak a summary method was
// written to prevent. Returns undefined only when there is no
// `narrativeSummary` method at all, so dispatch can fall through to the next rule.
function renderSummary(
  value: object,
  opts: Required<RenderOptions>,
  walk: RenderWalk,
): string | undefined {
  const fn = (value as { narrativeSummary?: unknown }).narrativeSummary;
  if (typeof fn !== "function") return undefined;
  // The hook is user code and may have a side effect: it runs at most once per instance per walk,
  // its answer — the failure marker included — cached, so tracing never repeats it.
  const cached = walk.cachedSummary(value);
  if (cached !== undefined) return cached;
  const text = invokeSummary(() => fn.call(value), opts);
  walk.cacheSummary(value, text);
  return text;
}

function invokeSummary(call: () => unknown, opts: Required<RenderOptions>): string {
  try {
    const text = String(call());
    return scanned(text, opts);
  } catch (err) {
    return errorMarker(err);
  }
}

function hasCustomToString(value: object): boolean {
  const fn = (value as { toString?: unknown }).toString;
  return typeof fn === "function" && fn !== Object.prototype.toString;
}

/**
 * The realm intrinsic prototypes {@link isPlatformValue} trusts native stringification for — the
 * "trusted-leaf" carve-out. `Map`/`Set` are deliberately absent: `dispatchObject`
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
 * @remarks Trust is scoped to "a leaf this library itself ships and can vouch for" — a realm
 * intrinsic, checked by IDENTITY — never "any leaf with no own enumerable key". "No own enumerable
 * key" is not proof of "nothing to hide": a true `#private` class field, a closure variable, or a
 * module-level `WeakMap` keyed by `this` are all invisible to `Object.keys` yet freely readable
 * from inside a field-less user class's own `toString()`, so trusting emptiness alone would trust
 * exactly the classes with the most to hide.
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
 * intrinsic in {@link PLATFORM_PROTOTYPES} except `Date`, which uses `toISOString()` instead.
 * `Date.prototype.toString()` bakes the host's locale and timezone
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
// to <TypeName>, a throw to the typed error marker Plain objects
// (Object.prototype.toString) still introspect. Only ever called for a platform value (see
// dispatchObject) — every other object, leaf or not, always field-walks instead (see
// isPlatformValue).
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
    return scanned(String(raw), opts);
  } catch (err) {
    return errorMarker(err);
  }
}

function renderObject(value: object, opts: Required<RenderOptions>, walk: RenderWalk): string {
  if (isThenable(value)) return "<pending>";
  if (walk.has(value)) return "<circular>";
  if (walk.isRepeat(value)) return repeatMarker(value);
  const isRoot = walk.atRoot;
  if (!walk.descend()) return "<max-depth>";
  try {
    return walk.visit(value, isRoot, () => dispatchObject(value, opts, walk), errorMarker);
  } finally {
    walk.ascend();
  }
}

// Render order is the same across every NarrativeTrace runtime: the declared elements hook (an
// explicit author declaration, so it wins even over Array/Set/Map's own dispatch), then Array,
// Set, Map, @narrativeSummary, custom toString
// (realm platform intrinsics only — see isPlatformValue), then field introspection. A custom
// toString() on any object that is NOT a platform value is never trusted, fields or not — see
// isPlatformValue's doc for the private-field/closure leak this closes. The first four steps are
// the shared origin decision (`elementOrigin`, element-origin.ts) the structured path consults too.
function dispatchObject(value: object, opts: Required<RenderOptions>, walk: RenderWalk): string {
  const origin = elementOrigin(value);
  switch (origin) {
    case "declared":
      return renderDeclaredElements(value, opts, walk);
    case "array":
      return renderArray(value, opts, walk);
    case "set":
      return renderSet(value, opts, walk);
    case "map":
      return renderMap(value, opts, walk);
    case "object":
      return renderOrdinary(value, opts, walk);
  }
}

function renderOrdinary(value: object, opts: Required<RenderOptions>, walk: RenderWalk): string {
  const summary = renderSummary(value, opts, walk);
  if (summary !== undefined) return summary;
  if (hasCustomToString(value) && isPlatformValue(value)) {
    return renderWithToString(value, opts);
  }
  return renderPlainObject(value, opts, walk);
}

function renderDeclaredElements(
  value: object,
  opts: Required<RenderOptions>,
  walk: RenderWalk,
): string {
  const elements = declaredElements(value, walk);
  const items = elements.slice(0, opts.maxCollectionItems).map((item) => render(item, opts, walk));
  if (elements.length > opts.maxCollectionItems) {
    items.push(`... (${elements.length} total)`);
  }
  return `[${items.join(", ")}]`;
}

// A user Set subclass can override values()/[Symbol.iterator] (the spread operator's own
// dispatch target), so members are read through Set.prototype.values, called on the instance —
// the platform ancestor's own state, identity-checked, never the subclass's override. A
// non-subclassed Set is unaffected: Set.prototype.values.call(value) reads the identical state
// value.values() would have.
function renderSet(value: object, opts: Required<RenderOptions>, walk: RenderWalk): string {
  const { items: members, total } = platformMembers(value, "set", opts.maxCollectionItems);
  const items = members.map((v) => render(v, opts, walk));
  if (total > opts.maxCollectionItems) {
    items.push(`… (${total} total)`);
  }
  return `[${items.join(", ")}]`;
}

// A user Map subclass can override entries() with a side-effecting or throwing implementation —
// the rendering rule requires entries to come from the platform ancestor's own state instead:
// Map.prototype.entries, called on the instance, bypassing whatever the subclass declared. A
// non-subclassed Map is unaffected, for the same reason as renderSet above.
function renderMap(value: object, opts: Required<RenderOptions>, walk: RenderWalk): string {
  const { items: entries, total } = platformMembers(value, "map", opts.maxCollectionItems);
  const joined = entries
    .map((entry) => {
      const [k, v] = entry as [unknown, unknown];
      return renderMapEntry(k, v, opts, walk);
    })
    .join(", ");
  return total > opts.maxCollectionItems ? `{${joined}, …}` : `{${joined}}`;
}

// A Map key can be an arbitrary object — including one carrying a redacted field, or one whose
// own toString() is the exact private-state hazard `isPlatformValue` guards against — so the key is
// rendered through the same total, redaction-aware `render()` every value goes through, never via
// a raw `String(key)`: that would call the key's toString() unconditionally, bypassing dispatch
// entirely. The "does this key's NAME look like a secret" check that decides whether to redact
// the associated VALUE stays scoped to string keys only — the common `Map<string, T>` shape it
// exists for — rather than reaching for an object key's rendered text, which is display output,
// not a field name to pattern-match.
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
// value goes through before falling back to the plain, unquoted key form — skipping straight to
// `String(key)` without that shape check is exactly the gap this closes. Every
// other key type's string form can never carry arbitrary text, so it keeps that bare `String(key)`
// display this renderer has always used.
function renderMapKey(key: unknown, opts: Required<RenderOptions>, walk: RenderWalk): string {
  if (key !== null && (typeof key === "object" || typeof key === "symbol")) {
    return render(key, opts, walk);
  }
  if (typeof key === "string") {
    return scanned(key, opts);
  }
  if (typeof key === "number" || typeof key === "bigint") {
    return numberText(key, opts.redactionPolicy);
  }
  return String(key);
}

function renderArray(value: object, opts: Required<RenderOptions>, walk: RenderWalk): string {
  const { items: members, total } = platformMembers(value, "array", opts.maxArrayItems);
  const items = members.map((item) => render(item, opts, walk));
  if (total > opts.maxArrayItems) {
    items.push(`... (${total} total)`);
  }
  return `[${items.join(", ")}]`;
}

function renderPlainObject(value: object, opts: Required<RenderOptions>, walk: RenderWalk): string {
  const keys = Object.keys(value);
  if (keys.length === 0 && hasOwnIteratorMethod(value)) {
    return `${typeName(value)}<size unknown>`;
  }
  const explicit = notTracedFields(value);
  const entries = keys
    .slice(0, opts.maxObjectKeys)
    .map((key) => renderEntry(value, key, explicit, opts, walk));
  if (keys.length > opts.maxObjectKeys) {
    entries.push(`... (${keys.length} total)`);
  }
  return `{${entries.join(", ")}}`;
}

// A hand-rolled iterable with at least one own-enumerable field already renders through the
// entries loop above — "object introspection of its own fields" is the correct, unmodified
// behaviour for that shape (a wrapper's own array field still renders as that array, and a
// LookalikeCollection's own counter field still renders as itself). Only the shape with ZERO
// own-enumerable state — otherwise indistinguishable from a genuinely empty object, "{}" — is
// mishandled today: it hides that the value actually holds data behind private fields or a
// closure. A type name (with no element count, since by construction there is no own-enumerable
// "length"/"size" data property free to read here) is the honest, non-misleading answer instead,
// checked without ever calling the iterator: `Symbol.iterator` is looked up by OWN property
// descriptor at each level of the prototype chain, walked by hand rather than `in`/instanceof, so
// an ACCESSOR named `[Symbol.iterator]` (vanishingly rare, but possible) is never invoked either
// — found-as-accessor answers `false`, the same safe default as "not iterable at all".
function hasOwnIteratorMethod(value: object): boolean {
  let level: object | null = value;
  while (level !== null) {
    const descriptor = Object.getOwnPropertyDescriptor(level, Symbol.iterator);
    if (descriptor !== undefined) return typeof descriptor.value === "function";
    level = Object.getPrototypeOf(level);
  }
  return false;
}

function renderEntry(
  value: object,
  key: string,
  explicit: ReadonlySet<string>,
  opts: Required<RenderOptions>,
  walk: RenderWalk,
): string {
  // Explicit annotation (static `notTraced` class field) redacts independently of the policy,
  // so it beats even RedactionPolicy.DISABLED (the annotation branch is independent of
  // shouldRedact).
  if (opts.redactionPolicy.isRedacted(key, explicit.has(key))) {
    return `"${key}": ${RedactionPolicy.MARKER}`;
  }
  return `"${key}": ${renderFieldValue(value, key, opts, walk)}`;
}

// Rendering reads a value's own STATE, never runs its code: a field is
// read through its OWN property descriptor rather than a plain `value[key]` access, so a data
// property's stored value is read directly and an accessor property's getter is never invoked —
// not even once, not even as a fallback. `Object.keys(value)` (renderPlainObject's key source)
// only ever yields own-enumerable keys, so the descriptor always exists here; the `undefined`
// branch is unreachable in practice and kept only so a future caller with a looser key source
// fails safely rather than throwing. A data property's stored value can itself be an object whose
// OWN rendering throws (e.g. a nested getter this same function already refuses, surfaced through
// a differently-shaped path) — that render() call is still guarded, scoped to this one field, so a
// sibling field never loses its own value to it.
function renderFieldValue(
  value: object,
  key: string,
  opts: Required<RenderOptions>,
  walk: RenderWalk,
): string {
  const field = readOwnField(value, key);
  if (!field.accessible) return INACCESSIBLE;
  try {
    return render(field.value, opts, walk);
  } catch (err) {
    return errorMarker(err);
  }
}
