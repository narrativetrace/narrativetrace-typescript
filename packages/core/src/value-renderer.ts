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
 * custom `toString()`, then field introspection.
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
 * Whether `value` is a leaf: no own enumerable key, so it has nothing field introspection could
 * ever walk (the renderer never reaches a prototype getter — see the `RenderOptions` remarks).
 *
 * @remarks This is the line the family invariant of 2026-09-11 draws: a custom `toString()` is
 * trusted ONLY for a leaf. An object with own fields is ALWAYS introspected instead, whatever its
 * `toString()` would have printed — not merely when one of ITS OWN fields happens to be a
 * redaction target. The narrower, field-name-based predecessor of this check
 * (`hasRedactedOwnField`) missed the shape the family security fix of 2026-09-11 exists for: a
 * `toString()` that interpolates a NESTED object's own curated text (`Order.toString()` printing
 * `this.customer`, itself a `Holder` with a redacted field) never puts the redacted field's name
 * or annotation on `Order` itself, so the own-field check saw nothing to catch — the leak lived a
 * level down, past where the check ever looked. Trusting `toString()` for leaves only closes that
 * whole class at once, at every depth, rather than chasing each new interpolation shape as its
 * own bug.
 */
function isLeaf(value: object): boolean {
  return Object.keys(value).length === 0;
}

// An object with its own toString() renders that string (sanitized + truncated) rather than a
// field dump; a null-returning toString falls back to <TypeName>, a throwing one to the typed
// error marker (Java renderWithToString). Plain objects (Object.prototype.toString) still
// introspect. Only ever called for a leaf (see dispatchObject) — an object with fields never
// reaches here at all.
function renderWithToString(value: object, opts: Required<RenderOptions>): string {
  try {
    const raw = (value as { toString(): unknown }).toString();
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
// (leaves only — see isLeaf), then field introspection. A custom toString() on an object that
// HAS fields is never trusted, regardless of whether any of those fields is itself a redaction
// target — see isLeaf's doc for the nested-interpolation leak this closes.
function dispatchObject(value: object, opts: Required<RenderOptions>, walk: RenderWalk): string {
  if (Array.isArray(value)) return renderArray(value, opts, walk);
  if (value instanceof Set) return renderSet(value, opts, walk);
  if (value instanceof Map) return renderMap(value, opts, walk);
  const summary = renderSummary(value, opts);
  if (summary !== undefined) return summary;
  if (hasCustomToString(value) && isLeaf(value)) {
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
// own toString() is the exact nested-interpolation hazard `isLeaf` guards against — so the key is
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
// `render()` dispatch (field introspection, redaction, sanitizing); every other key type's string
// form can never carry arbitrary text, so it keeps the plain, unquoted `String(key)` display this
// renderer has always used for map keys.
function renderMapKey(key: unknown, opts: Required<RenderOptions>, walk: RenderWalk): string {
  if (key !== null && (typeof key === "object" || typeof key === "symbol")) {
    return render(key, opts, walk);
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
