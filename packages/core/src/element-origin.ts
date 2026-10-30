// SPDX-License-Identifier: BUSL-1.1
// Licensed under the Business Source License 1.1 (see LICENSE); Change Date: four years from publication; Change License: Apache-2.0
// Copyright (c) 2026 Empower Agile
import type { RenderWalk } from "./render-walk.js";
import { withRenderingGuard } from "./rendering-guard.js";

/**
 * The third sanctioned rendering hook, alongside `narrativeSummary()` and a platform leaf's own
 * `toString()`: a type declares its own elements safe to enumerate by implementing this
 * well-known symbol as a method returning an `Iterable`.
 *
 * @remarks Unlike every other collection path, the declared method itself IS invoked — that is
 * the point of the hook, the author's own declaration that doing so is safe — but only from inside
 * the rendering guard, so a traced call reached from inside it records no span, and at most once
 * per instance per walk ({@link declaredElements}).
 */
export const NARRATIVE_ELEMENTS: unique symbol = Symbol.for("narrativetrace.elements");

/**
 * Where a value's elements come from, decided once for both render paths.
 *
 * INTENT: the one decision both render paths share. The flat path (`value-renderer.ts`) and the
 * structured path (`rendered-value.ts`) each ENCODE the verdict — text or a tree — but neither
 * makes it, so a rule that holds on one path cannot fail to hold on the other (owner rule
 * 2026-09-18, one origin decision shared by both paths).
 *
 * - `declared`: the type carries the {@link NARRATIVE_ELEMENTS} method; its elements come from the
 *   hook, ahead of every platform check.
 * - `array`, `set`, `map`: a platform collection, a user subclass included; elements come from the
 *   platform ancestor's own state ({@link platformMembers}), never the subclass's overrides.
 * - `object`: everything else — a hand-rolled iterable included — is read as an ordinary object,
 *   its own fields, with no iterator ever entered.
 */
export type ElementOrigin = "declared" | "array" | "set" | "map" | "object";

/**
 * The one origin decision.
 *
 * @llmNote Add a case to {@link ElementOrigin} and handle it in both renderers, never a second
 * `instanceof` ladder in one of them: the paths drifted once (B-191) and a rule on one path only
 * is not a rule.
 *
 * @param value an object about to be rendered.
 */
export function elementOrigin(value: object): ElementOrigin {
  if (typeof (value as Record<symbol, unknown>)[NARRATIVE_ELEMENTS] === "function") {
    return "declared";
  }
  if (Array.isArray(value)) return "array";
  if (value instanceof Set) return "set";
  if (value instanceof Map) return "map";
  return "object";
}

/**
 * Every element a `declared` value's hook yields, run under the rendering guard and at most once
 * per instance per walk. A throwing hook, or one returning something not iterable, throws — and
 * throws the same failure again on a later request in the same walk, without a second call.
 *
 * @param value a value whose {@link elementOrigin} is `declared`.
 * @param walk the walk that owns the once-per-instance cache.
 */
export function declaredElements(value: object, walk: RenderWalk): readonly unknown[] {
  const cached = walk.cachedElements(value);
  if (cached !== undefined) {
    if ("failure" in cached) throw cached.failure;
    return cached.elements;
  }
  try {
    const hook = (value as Record<symbol, unknown>)[NARRATIVE_ELEMENTS] as (
      this: object,
    ) => Iterable<unknown>;
    const elements = withRenderingGuard(() => [...hook.call(value)]);
    walk.cacheElements(value, { elements });
    return elements;
  } catch (failure) {
    walk.cacheElements(value, { failure });
    throw failure;
  }
}

/**
 * The first `limit` members of a platform collection, and how many it holds in all, read from the
 * platform ancestor's own state: an array by index, a Set and a Map through the intrinsic's own
 * method called on the instance. A user subclass's `[Symbol.iterator]`, `values()`, `entries()`
 * or species constructor never runs. A map member is a `[key, value]` pair.
 *
 * @param value a value whose {@link elementOrigin} is `array`, `set` or `map`.
 * @param origin that verdict.
 * @param limit how many members to return.
 */
export function platformMembers(
  value: object,
  origin: "array" | "set" | "map",
  limit: number,
): { readonly items: readonly unknown[]; readonly total: number } {
  if (origin === "array") {
    const array = value as unknown[];
    const items: unknown[] = [];
    for (let i = 0; i < array.length && i < limit; i++) items.push(array[i]);
    return { items, total: array.length };
  }
  const all =
    origin === "set"
      ? [...Set.prototype.values.call(value)]
      : [...(Map.prototype.entries.call(value) as MapIterator<[unknown, unknown]>)];
  return { items: all.slice(0, limit), total: all.length };
}
