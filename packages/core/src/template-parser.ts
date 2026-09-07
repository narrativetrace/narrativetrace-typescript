// SPDX-License-Identifier: BUSL-1.1
// Licensed under the Business Source License 1.1 (see LICENSE); Change Date: four years from publication; Change License: Apache-2.0
// Copyright (c) 2026 Empower Agile
import { notTracedFields, RedactionPolicy } from "./redaction-policy.js";
import { renderValue as renderValueSafely } from "./value-renderer.js";

const PLACEHOLDER = /\{([^}]+)\}/g;

type Segment = (values: Record<string, unknown>) => string;

/**
 * Upper bound on distinct cached templates. `resolveTemplate` is public API (re-exported from
 * `index.ts`), so its `template` argument is caller-supplied, not limited in practice to the
 * finite set of literal `@narrated`/`@onError` decorator strings a codebase happens to declare —
 * without a bound, a caller (or a future call site) feeding it per-request text would grow the
 * cache for the life of the process (cross-port shape F2, 2026-09-02 audit).
 */
const MAX_CACHED_TEMPLATES = 512;

/**
 * Least-recently-used, keyed by template text. `Map` iterates in insertion order, so "used" is
 * reasserted on every hit by deleting and re-inserting the entry — the eviction candidate is
 * always `cache.keys().next().value`. A template reused more often than {@link
 * MAX_CACHED_TEMPLATES} distinct templates appear between reuses is never evicted; a flood of
 * single-use templates evicts only itself.
 */
const cache = new Map<string, Segment[]>();

/**
 * Resolves `{param}` and `{obj.prop}` placeholders in a narration/error-context template
 * against a value map. A placeholder whose value is null/undefined, whose property is
 * missing, or whose getter throws is preserved verbatim (so unresolved tokens are visible
 * and can be flagged). Values interpolate unquoted. A `{obj.prop}` path that names a redacted
 * member resolves to {@link RedactionPolicy.MARKER} instead of the value — naming a path never
 * weakens the rules that apply to the value directly (owner decision 2026-08-31, TODO 46). Port
 * of Java `template/TemplateParser`.
 */
export function resolveTemplate(template: string, values: Record<string, unknown>): string {
  const segments = cachedSegments(template);
  return segments.map((segment) => segment(values)).join("");
}

function cachedSegments(template: string): Segment[] {
  const cached = cache.get(template);
  if (cached !== undefined) {
    cache.delete(template);
    cache.set(template, cached);
    return cached;
  }
  const segments = parse(template);
  if (cache.size >= MAX_CACHED_TEMPLATES) {
    const oldest = cache.keys().next().value;
    if (oldest !== undefined) cache.delete(oldest);
  }
  cache.set(template, segments);
  return segments;
}

/** Number of distinct templates currently cached. Test-only; deliberately not in the barrel. */
export function cachedTemplateCount(): number {
  return cache.size;
}

/** Whether `template` currently has a cached parse. Test-only; deliberately not in the barrel. */
export function isCached(template: string): boolean {
  return cache.has(template);
}

/** Placeholder keys still present in an already-resolved string (drives template warnings). */
export function findUnresolved(resolved: string): string[] {
  const keys: string[] = [];
  for (const match of resolved.matchAll(PLACEHOLDER)) {
    const key = match[1];
    if (key !== undefined) keys.push(key);
  }
  return keys;
}

function parse(template: string): Segment[] {
  const segments: Segment[] = [];
  let lastEnd = 0;
  for (const match of template.matchAll(PLACEHOLDER)) {
    const start = match.index ?? 0;
    if (start > lastEnd) {
      segments.push(literal(template.slice(lastEnd, start)));
    }
    segments.push(placeholder(match[1] as string));
    lastEnd = start + match[0].length;
  }
  if (lastEnd < template.length) {
    segments.push(literal(template.slice(lastEnd)));
  }
  return segments;
}

function literal(text: string): Segment {
  return () => text;
}

function placeholder(key: string): Segment {
  const dot = key.indexOf(".");
  if (dot < 0) return (values) => stringifyOrLiteral(values[key], `{${key}}`);
  const objectKey = key.slice(0, dot);
  const property = key.slice(dot + 1);
  return (values) => resolveProperty(values[objectKey], property, `{${key}}`);
}

/**
 * Resolves a `{obj.prop}` placeholder against the raw root object, redaction-checked first.
 *
 * INTENT: naming a property in a template must never weaken the rules that apply to the value
 * directly — `@narrated("charging {card.cvv}")` used to stringify the raw `cvv` even though a
 * `Card` with `static notTraced = ["cvv"]` renders it as the redaction marker everywhere else.
 * The decision is the exact one {@link RedactionPolicy.isRedacted} makes for reflective
 * introspection, so a member cannot be safe on one surface and leaked on the other.
 *
 * @remarks Only a single property level ever resolves here (see {@link accessProperty}), so
 * there is no multi-segment path to walk the way Java's `RedactedPaths` does — the property named
 * after the first dot is the only member this function can ever redact or reach.
 */
function resolveProperty(root: unknown, property: string, fallback: string): string {
  if (isRedactedMember(root, property)) return RedactionPolicy.MARKER;
  return stringifyOrLiteral(accessProperty(root, property), fallback);
}

/**
 * Whether `property` names a redacted member of `root`.
 *
 * @remarks A property that does not exist on `root` is not a redaction decision — it is an
 * authoring typo (a placeholder naming nothing), so it must stay literal and still raise the
 * unresolved-placeholder warning that exists to catch it. Nothing can leak either way: a path
 * that names nothing resolves to nothing. Existence is checked with `in` rather than by reading
 * the value, so a throwing getter cannot be mistaken for a missing member.
 */
function isRedactedMember(root: unknown, property: string): boolean {
  if (root == null || (typeof root !== "object" && typeof root !== "function")) return false;
  try {
    if (!(property in root)) return false;
  } catch {
    return false;
  }
  const explicit = notTracedFields(root as object).has(property);
  return RedactionPolicy.DEFAULT.isRedacted(property, explicit);
}

function stringifyOrLiteral(value: unknown, fallback: string): string {
  if (value == null) return fallback;
  return renderValue(value);
}

/**
 * Renders a resolved value for substitution, through the one renderer that knows what is hidden.
 *
 * INTENT: redaction outranks `toString()`, and must never be second-guessed by whether the safe
 * rendering happens to carry the marker. `@narrated("charging {card}")` names the object rather
 * than a path into it, so every non-scalar goes to `value-renderer`'s `renderValue` — total,
 * bounded, and the single place redaction is decided — and nothing else ever touches it.
 *
 * @remarks There is deliberately no fallback to the value's own `toString()`. A prior version of
 * this function asked whether the safe rendering *contained* {@link RedactionPolicy.MARKER} and
 * printed the value's raw `toString()` when it did not — but the marker is equally absent when the
 * renderer never saw the whole value: truncated at `value-renderer`'s field/collection-item cap,
 * cut at its depth cap, or stopped at a cycle. "No marker" meant "nothing is hidden" and "the
 * renderer did not look" alike, and the second reading printed the secret in full — the exact
 * shape Java's `TemplateParser.renderValue` fixed for the identical inference (Java fuzz finding,
 * 2026-09-02: a whole-object placeholder whose redacted component sat past the renderer's field
 * cap). A narration that was never leaking keeps the same bytes either way: `value-renderer`
 * already trusts a class's own `toString()` whenever nothing on it is a redaction target (an
 * author's `Money.toString()` still reads `EUR 10.00`), so this delegation costs nothing on the
 * cases that were already safe.
 */
function renderValue(value: unknown): string {
  if (typeof value !== "object" && typeof value !== "function") return String(value);
  return renderValueSafely(value);
}

function accessProperty(object: unknown, property: string): unknown {
  if (object == null || (typeof object !== "object" && typeof object !== "function")) {
    return undefined;
  }
  try {
    return (object as Record<string, unknown>)[property];
  } catch {
    // throwing getter → treat as unresolved so the placeholder stays literal
    return undefined;
  }
}
