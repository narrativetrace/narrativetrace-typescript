// SPDX-License-Identifier: BUSL-1.1
// Licensed under the Business Source License 1.1 (see LICENSE); Change Date: four years from publication; Change License: Apache-2.0
// Copyright (c) 2026 Empower Agile
/**
 * Where a value renderer currently is inside one object graph — shared by the flat walk (`value-renderer.ts`)
 * and the structured walk (`rendered-value.ts`) so both make one decision.
 *
 * INTENT: one carrier answers "may I follow this reference?" (the ancestors on the path, for the
 * `<circular>` guard; the depth, for `<max-depth>`), "have I already rendered this?" (the
 * completed-rendering memo, for `<repeat: TypeName>`) and "may I render another value at all?" (the
 * total node budget, for `<max-nodes>`).
 *
 * @llmNote The ancestor set is scoped to the current path — added on the way down, removed on the
 * way back — so a shared object reached twice by different paths is not mistaken for a cycle. That
 * alone does not bound a walk: when the sharing repeats down the graph (a ladder whose two fields
 * hold the same next rung) every rung doubles the walk, n + 1 objects rendering as 2^n nodes
 * (ADV-2026-10-23-1, B-185). So a completed rendering of at least {@link REPEAT_MIN_NODES} values
 * is remembered by identity and a later reference renders as a back-reference, and every value the
 * walk renders counts against {@link MAX_NODES}, the guarantee for any graph, shared or not.
 * Counting happens before any scalar/complex split, so the flat and structured paths — which
 * classify a few leaves differently — keep identical counts and therefore identical repeats.
 *
 * The walk also carries the narrative-summary hook's answers ({@link cachedSummary}) and the
 * declared-elements hook's ({@link cachedElements}), so each hook runs at most once per instance
 * per walk.
 */

/**
 * How many levels of complex value the flat renderer follows before it renders `<max-depth>`.
 *
 * @remarks The cycle guard alone does not bound a walk: a linked list, a parent-child tree, or a
 * JSON document mapped to nested objects is arbitrarily deep while repeating no object. Following
 * one recursively without a limit risks a `RangeError: Maximum call stack size exceeded` raised
 * inside instrumentation — an observability failure becoming an application failure, which the
 * pipeline contract forbids. Real DTO graphs are single digits deep; this cap exists for the
 * cyclic-shaped data the ancestor guard cannot see.
 */
export const MAX_DEPTH = 32;

/** How many values one walk renders, at most, before every further value renders `<max-nodes>`. */
export const MAX_NODES = 1024;

/**
 * The smallest completed rendering, in values, that a later reference to the same instance points
 * back to instead of repeating. A smaller one is as cheap to repeat as to point at, and reads
 * better repeated.
 */
export const REPEAT_MIN_NODES = 8;

/** The node-budget marker. */
export const TOO_MANY = "<max-nodes>";

/** The back-reference marker for an instance already rendered in full earlier in the walk. */
export function repeatMarker(value: object): string {
  return `<repeat: ${value.constructor?.name ?? "Object"}>`;
}

/** What a declared-elements hook answered for one instance: its elements, or how it failed. */
export type ElementsOutcome =
  | { readonly elements: readonly unknown[] }
  | { readonly failure: unknown };

export class RenderWalk {
  /** `true` for an ancestor on the current path, `false` for a completed rendering. */
  private readonly seen = new Map<object, boolean>();
  private readonly summaries = new Map<object, string>();
  private readonly elements = new Map<object, ElementsOutcome>();
  private depth = 0;
  private counted = 0;

  /** Whether `value` is an ancestor of the current path — a cycle, not a chain. */
  has(value: object): boolean {
    return this.seen.get(value) === true;
  }

  /** Records `value` as an ancestor of the current path. */
  add(value: object): void {
    this.seen.set(value, true);
  }

  /** Drops `value` from the path, on the way back out. */
  remove(value: object): void {
    this.seen.delete(value);
  }

  /** Whether `value` already rendered in full earlier in this walk. */
  isRepeat(value: object): boolean {
    return this.seen.get(value) === false;
  }

  /**
   * Remembers that `value` rendered to completion, when that rendering was large enough to be
   * worth pointing back to. The root is never remembered: it cannot be reached again except as a
   * cycle, which the ancestor half already answers.
   *
   * @param nodesBefore {@link nodes} as it stood when the value's own rendering began.
   * @param atRoot whether `value` is the walk's root.
   */
  rendered(value: object, nodesBefore: number, atRoot: boolean): void {
    if (atRoot || this.counted - nodesBefore + 1 < REPEAT_MIN_NODES) return;
    if (!this.seen.has(value)) this.seen.set(value, false);
  }

  /**
   * Renders `value` as one complex value: on the ancestor path while `body` runs, and — when
   * `body` completed — remembered for back-references. A rendering that threw answers `failed`
   * and is not remembered, so a later reference tries again.
   *
   * @param isRoot whether `value` is the walk's root (never remembered).
   */
  visit<T>(value: object, isRoot: boolean, body: () => T, failed: (err: unknown) => T): T {
    this.add(value);
    const nodesBefore = this.counted;
    let result: T;
    try {
      result = body();
    } catch (err) {
      return failed(err);
    } finally {
      this.remove(value);
    }
    this.rendered(value, nodesBefore, isRoot);
    return result;
  }

  /** Counts one more rendered value; `false` means the caller must render {@link TOO_MANY}. */
  count(): boolean {
    if (this.counted >= MAX_NODES) return false;
    this.counted++;
    return true;
  }

  /** How many values this walk has counted so far. */
  get nodes(): number {
    return this.counted;
  }

  /** Whether this walk is at its root (no complex value is being rendered). */
  get atRoot(): boolean {
    return this.depth === 0;
  }

  /** The summary hook's answer for `value` earlier in this walk, or `undefined`. */
  cachedSummary(value: object): string | undefined {
    return this.summaries.get(value);
  }

  /** Records the summary hook's answer for `value`, for the rest of this walk. */
  cacheSummary(value: object, text: string): void {
    this.summaries.set(value, text);
  }

  /** The declared-elements hook's outcome for `value` earlier in this walk, or `undefined`. */
  cachedElements(value: object): ElementsOutcome | undefined {
    return this.elements.get(value);
  }

  /** Records the declared-elements hook's outcome for `value`, for the rest of this walk. */
  cacheElements(value: object, outcome: ElementsOutcome): void {
    this.elements.set(value, outcome);
  }

  /**
   * Takes one step down; `false` means the caller must render `<max-depth>` and must not call
   * {@link ascend}.
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
