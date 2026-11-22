// SPDX-License-Identifier: BUSL-1.1
// Licensed under the Business Source License 1.1 (see LICENSE); Change Date: four years from publication; Change License: Apache-2.0
// Copyright (c) 2026 Empower Agile
import { ControlEscape } from "./control-escape.js";
import { declaredElements, elementOrigin, platformMembers } from "./element-origin.js";
import { errorTypeName } from "./error-display.js";
import { INACCESSIBLE, readOwnField } from "./field-read.js";
import { isThenable } from "./is-thenable.js";
import {
  notTracedFields,
  numberText,
  numericTextIsSecret,
  RedactionPolicy,
} from "./redaction-policy.js";
import { clampLimits } from "./render-limits.js";
import { RenderWalk, repeatMarker, TOO_MANY } from "./render-walk.js";

/**
 * Typed, depth-capped structured form of a rendered value. It
 * preserves the primitive type so exporters can emit typed attributes (number→number,
 * boolean→bool, homogeneous list→array) instead of only a flat string. `other` carries a
 * pre-stringified form for anything without a native attribute type (bigint, symbol, function,
 * null, redacted, circular, depth-exceeded).
 */
export type RenderedValue =
  | { readonly kind: "string"; readonly value: string }
  | { readonly kind: "number"; readonly value: number }
  | { readonly kind: "boolean"; readonly value: boolean }
  | { readonly kind: "list"; readonly items: readonly RenderedValue[] }
  | { readonly kind: "object"; readonly typeName: string; readonly fields: RenderedFields }
  | { readonly kind: "other"; readonly text: string };

/** Named children of an object-kind {@link RenderedValue}, keyed by property name. */
export type RenderedFields = { readonly [key: string]: RenderedValue };

/**
 * Bounds and redaction policy for {@link renderStructured}, keeping capture cost and output size
 * finite on deep or wide inputs. Any omitted field falls back to the built-in default.
 *
 * @remarks Bounds are truncation limits, not errors: extra depth/items/fields are dropped (depth
 * collapses to a type name, over-long strings are elided with `…`) rather than throwing. A limit is
 * a size: one below zero is clamped to `0`, with one `console.warn` line naming each clamped limit
 * (B-207), never read as "all but the last".
 * @defaultValue maxDepth 3, maxItems 5, maxFields 5, maxStringLength 200, redactionPolicy default.
 */
export interface StructuredOptions {
  readonly maxDepth?: number;
  readonly maxItems?: number;
  readonly maxFields?: number;
  readonly maxStringLength?: number;
  readonly redactionPolicy?: RedactionPolicy;
}

const DEFAULTS: Required<StructuredOptions> = {
  maxDepth: 3,
  maxItems: 5,
  maxFields: 5,
  maxStringLength: 200,
  redactionPolicy: RedactionPolicy.DEFAULT,
};

function other(text: string): RenderedValue {
  return { kind: "other", text };
}

const REDACTED: RenderedValue = other(RedactionPolicy.MARKER);
const INACCESSIBLE_VALUE: RenderedValue = other(INACCESSIBLE);

/**
 * Converts an arbitrary runtime value into a bounded, typed {@link RenderedValue} tree.
 *
 * INTENT: the capture-side entry point that turns a live argument/return into export-safe data —
 * preserving primitive types, capping depth/breadth per {@link StructuredOptions}, and applying
 * redaction. Cycles resolve to `<circular>`, thenables to `<pending>`, and depth-exceeded objects
 * to their type name; an instance already rendered with at least 8 values renders as
 * `<repeat: TypeName>` when reached again, and past 1024 values a value renders `<max-nodes>`
 * (B-185, `render-walk.ts` — the same decisions the flat renderer makes); the result is always
 * finite and never throws.
 *
 * @param value any runtime value, including `null`, functions, collections, and cyclic graphs.
 * @param options optional bounds/redaction overrides; defaults apply per field when omitted.
 * @remarks Unlike the flat renderer (`value-renderer.ts`'s `renderValue`/`renderCapture`), this
 * path never invokes a `narrativeSummary()` method or a custom `toString()` — `dispatchObject`
 * below only recurses into Array/Set/Map (read from the platform's own state, never a subclass's
 * override) or walks own-enumerable fields (`structuredFields`), and a field read that happens to
 * be a getter is never itself a traced method under either wrapping scheme (`traceObject`,
 * `wrapPrototypeMethods` both skip accessor properties). The one user code it does run is the
 * declared-elements hook (`NARRATIVE_ELEMENTS`, the third sanctioned hook), and that runs inside
 * `withRenderingGuard` (`declaredElements`, element-origin.ts), so it cannot re-enter tracing
 * either — see `withRenderingGuard`'s own doc comment for the full reasoning, and
 * `packages/proxy/__tests__/render-reentrancy.test.ts` / `packages/nestjs/__tests__/render-reentrancy.test.ts`
 * for the positive assertions this claim rests on.
 */
export function renderStructured(value: unknown, options?: StructuredOptions): RenderedValue {
  const opts = clampLimits({ ...DEFAULTS, ...options }, [
    "maxDepth",
    "maxItems",
    "maxFields",
    "maxStringLength",
  ]);
  return structuredRoot(value, opts, 0, new RenderWalk());
}

/**
 * One nested value: counted against the walk's total budget first, then rendered — before any
 * scalar/object split, exactly as the flat renderer's funnel does, so both paths agree (B-185).
 */
function structured(
  value: unknown,
  opts: Required<StructuredOptions>,
  depth: number,
  walk: RenderWalk,
): RenderedValue {
  if (!walk.count()) return other(TOO_MANY);
  return structuredRoot(value, opts, depth, walk);
}

/** The walk's entry: the root is not counted, only the values nested under it. */
function structuredRoot(
  value: unknown,
  opts: Required<StructuredOptions>,
  depth: number,
  walk: RenderWalk,
): RenderedValue {
  if (value === null) return other("null");
  if (typeof value === "object") return structuredObject(value as object, opts, depth, walk);
  return structuredPrimitive(value, opts);
}

/** The shared cap for a structured-path scalar string: {@link structuredPrimitive} and
 * {@link structuredMapKeyText} must keep reading this same line — a key is capped exactly like a
 * value is, never via a second copy of the truncation rule. */
function cappedString(value: string, maxStringLength: number): string {
  return value.length > maxStringLength ? `${value.slice(0, maxStringLength)}…` : value;
}

// A symbol's description is caller-supplied text — the structured-path analog of a hostile
// Number.toString(): shape-scanned on the raw text, then sanitized, like every other leaf text.
function structuredSymbol(symbol: symbol, opts: Required<StructuredOptions>): RenderedValue {
  const description = symbol.description ?? "";
  if (opts.redactionPolicy.shouldRedactValue(description)) {
    return other(`Symbol(${RedactionPolicy.MARKER})`);
  }
  return other(`Symbol(${ControlEscape.sanitize(description)})`);
}

// Value-shape masking (RedactionPolicy.shouldRedactValue) is a second, independent redaction axis
// from field-name matching, checked here so every scalar string reaches it regardless of whether it
// arrived as a top-level value, a list item, an unredacted Map value, or an ordinarily-named object
// field — every one of those paths dispatches through `structured()` into here.
function structuredPrimitive(value: unknown, opts: Required<StructuredOptions>): RenderedValue {
  const type = typeof value;
  if (type === "string") {
    const s = value as string;
    if (opts.redactionPolicy.shouldRedactValue(s)) return REDACTED;
    return { kind: "string", value: cappedString(s, opts.maxStringLength) };
  }
  if (
    (type === "number" || type === "bigint") &&
    numericTextIsSecret(String(value), opts.redactionPolicy)
  ) {
    return REDACTED;
  }
  if (type === "number") return { kind: "number", value: value as number };
  if (type === "boolean") return { kind: "boolean", value: value as boolean };
  if (type === "bigint") return other(`${value as bigint}n`);
  if (type === "undefined") return other("undefined");
  if (type === "function") return other("<function>");
  return structuredSymbol(value as symbol, opts);
}

/**
 * A field, getter or map key can run arbitrary application code (a throwing accessor, a hostile
 * toString reached indirectly via `String(key)`) — this must degrade like every other
 * introspection hazard here, never propagate. Matches the flat renderer's same-granularity
 * whole-object fallback (`renderObject` in value-renderer.ts).
 */
function structuredObject(
  value: object,
  opts: Required<StructuredOptions>,
  depth: number,
  walk: RenderWalk,
): RenderedValue {
  if (isThenable(value)) return other("<pending>");
  if (walk.has(value)) return other("<circular>");
  if (walk.isRepeat(value)) return other(repeatMarker(value));
  if (depth >= opts.maxDepth) return other(objectTypeName(value));
  return walk.visit(
    value,
    depth === 0,
    () => dispatchObject(value, opts, depth, walk),
    (err) => other(`<error: ${errorTypeName(err)}>`),
  );
}

function dispatchObject(
  value: object,
  opts: Required<StructuredOptions>,
  depth: number,
  walk: RenderWalk,
): RenderedValue {
  const origin = elementOrigin(value);
  switch (origin) {
    case "declared":
      return structuredDeclared(value, opts, depth, walk);
    case "array":
    case "set":
      return structuredList(platformMembers(value, origin, opts.maxItems).items, opts, depth, walk);
    case "map":
      return structuredMap(value, opts, depth, walk);
    case "object":
      return structuredFields(value, opts, depth, walk);
  }
}

// The declared-elements hook, shared with the flat path (`declaredElements`, element-origin.ts):
// the hook runs under the rendering guard, once per instance per walk, and a failure (a throwing
// hook, a result that is not iterable) is the typed error marker for this value alone — exactly
// what the flat path's whole-value fallback prints.
function structuredDeclared(
  value: object,
  opts: Required<StructuredOptions>,
  depth: number,
  walk: RenderWalk,
): RenderedValue {
  try {
    return structuredList(declaredElements(value, walk), opts, depth, walk);
  } catch (err) {
    return other(`<error: ${errorTypeName(err)}>`);
  }
}

function structuredList(
  items: readonly unknown[],
  opts: Required<StructuredOptions>,
  depth: number,
  walk: RenderWalk,
): RenderedValue {
  const capped = items.slice(0, opts.maxItems).map((v) => structured(v, opts, depth + 1, walk));
  return { kind: "list", items: capped };
}

// A Map key can be an arbitrary object — one carrying a redacted field, or one whose own
// toString() interpolates such a field — so `RenderedValue.object.fields` (a flat
// `Record<string, RenderedValue>`, which has no room for a key that is itself a typed tree) must
// still get that key through the redaction-aware `structured()` dispatch before it is flattened
// into a label, never via a raw `String(key)`: that would call the key's toString()
// unconditionally and bypass every redaction rule `structured()` would otherwise apply — the
// structured-path analog of the flat renderer's `renderMapEntry`. The "does this key's NAME look
// like a secret" check that decides whether to redact the associated VALUE stays scoped to string
// keys, the common `Map<string, T>` shape it exists for.
function structuredMap(
  value: object,
  opts: Required<StructuredOptions>,
  depth: number,
  walk: RenderWalk,
): RenderedValue {
  const fields: Record<string, RenderedValue> = {};
  for (const entry of platformMembers(value, "map", opts.maxFields).items) {
    const [k, v] = entry as [unknown, unknown];
    const key = structuredMapKeyText(k, opts, depth, walk);
    const nameRedactsValue = typeof k === "string" && opts.redactionPolicy.shouldRedact(k);
    fields[key] = nameRedactsValue ? REDACTED : structured(v, opts, depth + 1, walk);
  }
  return { kind: "object", typeName: "Map", fields };
}

// Objects and symbols route through the same safe `structured()` dispatch every value does, then
// flatten to a label via {@link renderedValueAsText} — the flattened text is safe by construction
// because it is built FROM an already-redacted tree. A string key is data too — the common
// `Map<string, T>` shape this function exists for is exactly how a caller indexes metadata by
// credential — so it honours the same value-shape axis (`shouldRedactValue`) every scalar string
// value goes through, via the same {@link cappedString} cap `structuredPrimitive` applies, before
// falling back to the plain label — skipping straight to `String(key)` without that shape check
// is exactly the gap this closes. Every other key type's string form can
// never carry arbitrary text, so it keeps that bare `String(key)` label this renderer has always
// used.
function structuredMapKeyText(
  key: unknown,
  opts: Required<StructuredOptions>,
  depth: number,
  walk: RenderWalk,
): string {
  if (key !== null && (typeof key === "object" || typeof key === "symbol")) {
    return renderedValueAsText(structured(key, opts, depth + 1, walk));
  }
  if (typeof key === "string") {
    if (opts.redactionPolicy.shouldRedactValue(key)) return RedactionPolicy.MARKER;
    return cappedString(key, opts.maxStringLength);
  }
  if (typeof key === "number" || typeof key === "bigint") {
    return numberText(key, opts.redactionPolicy);
  }
  return String(key);
}

// Reconstitutes a compact, flat text label from an already-built RenderedValue tree — used only
// for a Map key label, where the field-key position has no room for a typed tree of its own. Safe
// by construction: every byte here already passed through `structured()`'s redaction/sanitizing,
// so no additional escaping is needed on the way back out.
function renderedValueAsText(value: RenderedValue): string {
  switch (value.kind) {
    case "string":
      return value.value;
    case "number":
    case "boolean":
      return String(value.value);
    case "list":
      return `[${value.items.map(renderedValueAsText).join(", ")}]`;
    case "object":
      return `${value.typeName}{${Object.entries(value.fields)
        .map(([k, v]) => `${k}: ${renderedValueAsText(v)}`)
        .join(", ")}}`;
    case "other":
      return value.text;
  }
}

function structuredFields(
  value: object,
  opts: Required<StructuredOptions>,
  depth: number,
  walk: RenderWalk,
): RenderedValue {
  const explicit = notTracedFields(value);
  const fields: Record<string, RenderedValue> = {};
  for (const key of Object.keys(value).slice(0, opts.maxFields)) {
    fields[key] = opts.redactionPolicy.isRedacted(key, explicit.has(key))
      ? REDACTED
      : structuredField(value, key, opts, depth, walk);
  }
  return { kind: "object", typeName: objectTypeName(value), fields };
}

// An accessor field is the `other` marker `<inaccessible>` — the structured twin of the flat
// path's text — because the field read (`readOwnField`) is the one decision both paths share.
function structuredField(
  value: object,
  key: string,
  opts: Required<StructuredOptions>,
  depth: number,
  walk: RenderWalk,
): RenderedValue {
  const field = readOwnField(value, key);
  return field.accessible ? structured(field.value, opts, depth + 1, walk) : INACCESSIBLE_VALUE;
}

function objectTypeName(value: object): string {
  return errorTypeName(value);
}
