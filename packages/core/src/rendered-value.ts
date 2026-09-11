// SPDX-License-Identifier: BUSL-1.1
// Licensed under the Business Source License 1.1 (see LICENSE); Change Date: four years from publication; Change License: Apache-2.0
// Copyright (c) 2026 Empower Agile
import { ControlEscape } from "./control-escape.js";
import { isThenable } from "./is-thenable.js";
import { notTracedFields, RedactionPolicy } from "./redaction-policy.js";

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
 * collapses to a type name, over-long strings are elided with `…`) rather than throwing.
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

/**
 * Converts an arbitrary runtime value into a bounded, typed {@link RenderedValue} tree.
 *
 * INTENT: the capture-side entry point that turns a live argument/return into export-safe data —
 * preserving primitive types, capping depth/breadth per {@link StructuredOptions}, and applying
 * redaction. Cycles resolve to `<circular>`, thenables to `<pending>`, and depth-exceeded objects
 * to their type name; the result is always finite and never throws.
 *
 * @param value any runtime value, including `null`, functions, collections, and cyclic graphs.
 * @param options optional bounds/redaction overrides; defaults apply per field when omitted.
 */
export function renderStructured(value: unknown, options?: StructuredOptions): RenderedValue {
  return structured(value, { ...DEFAULTS, ...options }, 0, new Set());
}

function structured(
  value: unknown,
  opts: Required<StructuredOptions>,
  depth: number,
  seen: Set<object>,
): RenderedValue {
  if (value === null) return other("null");
  if (typeof value === "object") return structuredObject(value as object, opts, depth, seen);
  return structuredPrimitive(value, opts);
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
    const capped = s.length > opts.maxStringLength ? `${s.slice(0, opts.maxStringLength)}…` : s;
    return { kind: "string", value: capped };
  }
  if (type === "number") return { kind: "number", value: value as number };
  if (type === "boolean") return { kind: "boolean", value: value as boolean };
  if (type === "bigint") return other(`${value as bigint}n`);
  if (type === "undefined") return other("undefined");
  if (type === "function") return other("<function>");
  // A symbol's description is caller-supplied text — the structured-path analog of a hostile
  // Number.toString(), so it is sanitized like every other scalar text this path produces rather
  // than passed through raw via String(value).
  const symbol = value as symbol;
  return other(`Symbol(${ControlEscape.sanitize(symbol.description ?? "")})`);
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
  seen: Set<object>,
): RenderedValue {
  if (isThenable(value)) return other("<pending>");
  if (seen.has(value)) return other("<circular>");
  if (depth >= opts.maxDepth) return other(objectTypeName(value));
  seen.add(value);
  try {
    return dispatchObject(value, opts, depth, seen);
  } catch {
    return other(objectTypeName(value));
  } finally {
    seen.delete(value);
  }
}

function dispatchObject(
  value: object,
  opts: Required<StructuredOptions>,
  depth: number,
  seen: Set<object>,
): RenderedValue {
  if (Array.isArray(value)) return structuredList(value, opts, depth, seen);
  if (value instanceof Set) return structuredList([...value], opts, depth, seen);
  if (value instanceof Map) return structuredMap(value, opts, depth, seen);
  return structuredFields(value, opts, depth, seen);
}

function structuredList(
  items: readonly unknown[],
  opts: Required<StructuredOptions>,
  depth: number,
  seen: Set<object>,
): RenderedValue {
  const capped = items.slice(0, opts.maxItems).map((v) => structured(v, opts, depth + 1, seen));
  return { kind: "list", items: capped };
}

// A Map key can be an arbitrary object — one carrying a redacted field, or one whose own
// toString() interpolates such a field — so `RenderedValue.object.fields` (a flat
// `Record<string, RenderedValue>`, which has no room for a key that is itself a typed tree) must
// still get that key through the redaction-aware `structured()` dispatch before it is flattened
// into a label, never via a raw `String(key)` (2026-09-11 family security fix, the structured-path
// analog of the flat renderer's `renderMapEntry`: `String(key)` on an object calls its toString()
// unconditionally and bypasses every redaction rule `structured()` would otherwise apply). The
// "does this key's NAME look like a secret" check that decides whether to redact the associated
// VALUE stays scoped to string keys, the common `Map<string, T>` shape it exists for.
function structuredMap(
  value: Map<unknown, unknown>,
  opts: Required<StructuredOptions>,
  depth: number,
  seen: Set<object>,
): RenderedValue {
  const fields: Record<string, RenderedValue> = {};
  for (const [k, v] of [...value.entries()].slice(0, opts.maxFields)) {
    const key = structuredMapKeyText(k, opts, depth, seen);
    const nameRedactsValue = typeof k === "string" && opts.redactionPolicy.shouldRedact(k);
    fields[key] = nameRedactsValue ? REDACTED : structured(v, opts, depth + 1, seen);
  }
  return { kind: "object", typeName: "Map", fields };
}

// Objects and symbols route through the same safe `structured()` dispatch every value does, then
// flatten to a label via {@link renderedValueAsText} — the flattened text is safe by construction
// because it is built FROM an already-redacted tree. Every other key type's string form can never
// carry arbitrary text, so it keeps the plain `String(key)` label this renderer has always used.
function structuredMapKeyText(
  key: unknown,
  opts: Required<StructuredOptions>,
  depth: number,
  seen: Set<object>,
): string {
  if (key !== null && (typeof key === "object" || typeof key === "symbol")) {
    return renderedValueAsText(structured(key, opts, depth + 1, seen));
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
  seen: Set<object>,
): RenderedValue {
  const explicit = notTracedFields(value);
  const fields: Record<string, RenderedValue> = {};
  for (const key of Object.keys(value).slice(0, opts.maxFields)) {
    fields[key] = opts.redactionPolicy.isRedacted(key, explicit.has(key))
      ? REDACTED
      : structured((value as Record<string, unknown>)[key], opts, depth + 1, seen);
  }
  return { kind: "object", typeName: objectTypeName(value), fields };
}

function objectTypeName(value: object): string {
  return value.constructor?.name ?? "Object";
}
