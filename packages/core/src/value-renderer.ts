// SPDX-License-Identifier: BUSL-1.1
// Licensed under the Business Source License 1.1 (see LICENSE); Change Date: four years from publication; Change License: Apache-2.0
// Copyright (c) 2026 Empower Agile
import { ControlEscape } from "./control-escape.js";
import { isThenable } from "./is-thenable.js";
import { notTracedFields, RedactionPolicy } from "./redaction-policy.js";

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
 * @returns the rendered string; thenables render as `<pending>` (never awaited) and objects whose
 * rendering throws fall back to `<TypeName>`.
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
// over field introspection / toString (Java @NarrativeSummary). A throwing summary is ignored so
// rendering falls through to the normal path. Returns undefined when no summary applies.
function renderSummary(value: object, opts: Required<RenderOptions>): string | undefined {
  const fn = (value as { narrativeSummary?: unknown }).narrativeSummary;
  if (typeof fn !== "function") return undefined;
  try {
    return truncate(ControlEscape.sanitize(String(fn.call(value))), opts.maxStringLength);
  } catch {
    return undefined;
  }
}

function hasCustomToString(value: object): boolean {
  const fn = (value as { toString?: unknown }).toString;
  return typeof fn === "function" && fn !== Object.prototype.toString;
}

// An object with its own toString() renders that string (sanitized + truncated) rather than a
// field dump; a null-returning or throwing toString falls back to <TypeName> (Java
// renderWithToString). Plain objects (Object.prototype.toString) still introspect.
function renderWithToString(value: object, opts: Required<RenderOptions>): string {
  try {
    const raw = (value as { toString(): unknown }).toString();
    if (raw == null) return `<${typeName(value)}>`;
    return truncate(ControlEscape.sanitize(String(raw)), opts.maxStringLength);
  } catch {
    return `<${typeName(value)}>`;
  }
}

function renderObject(value: object, opts: Required<RenderOptions>, walk: RenderWalk): string {
  if (isThenable(value)) return "<pending>";
  if (walk.has(value)) return "<circular>";
  if (!walk.descend()) return "<max-depth>";
  walk.add(value);
  try {
    return dispatchObject(value, opts, walk);
  } catch {
    return "<Object>";
  } finally {
    walk.ascend();
    walk.remove(value);
  }
}

/**
 * Whether any own field of `value` is a redaction target — explicitly annotated or deny-listed by
 * name.
 *
 * @remarks A custom `toString()` is trusted as a curated summary only when it cannot be hiding a
 * redacted field. Java draws this line with `Class.isRecord()` — a language-level guarantee that a
 * record's components are always introspected, toString or not; JS classes carry no such
 * distinction, so this checks the one thing that actually matters: does *this* object have a field
 * the redaction rules would otherwise catch. When it does, field introspection runs instead of
 * `toString()`, so a class that adds `static notTraced` or a deny-listed field name later cannot
 * silently start leaking through a `toString()` nobody revisited.
 */
function hasRedactedOwnField(value: object, opts: Required<RenderOptions>): boolean {
  const explicit = notTracedFields(value);
  return Object.keys(value).some((key) => opts.redactionPolicy.isRedacted(key, explicit.has(key)));
}

// Render order mirrors Java ValueRenderer: Array, Set, Map, @narrativeSummary, custom toString
// (unless a field it could be hiding is a redaction target), then field introspection.
function dispatchObject(value: object, opts: Required<RenderOptions>, walk: RenderWalk): string {
  if (Array.isArray(value)) return renderArray(value, opts, walk);
  if (value instanceof Set) return renderSet(value, opts, walk);
  if (value instanceof Map) return renderMap(value, opts, walk);
  const summary = renderSummary(value, opts);
  if (summary !== undefined) return summary;
  if (hasCustomToString(value) && !hasRedactedOwnField(value, opts)) {
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

function renderMapEntry(
  key: unknown,
  value: unknown,
  opts: Required<RenderOptions>,
  walk: RenderWalk,
): string {
  const keyName = String(key);
  const rendered = opts.redactionPolicy.shouldRedact(keyName)
    ? RedactionPolicy.MARKER
    : render(value, opts, walk);
  return `${keyName}=${rendered}`;
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
  return `"${key}": ${render((value as Record<string, unknown>)[key], opts, walk)}`;
}
