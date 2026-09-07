// SPDX-License-Identifier: BUSL-1.1
// Licensed under the Business Source License 1.1 (see LICENSE); Change Date: four years from publication; Change License: Apache-2.0
// Copyright (c) 2026 Empower Agile
/**
 * Reason a {@link TreeWalk} refuses to descend into a node's children: the path has already gone
 * `MAX_DEPTH` levels deep, or `node` is already an ancestor on the current path (a cycle).
 */
export type TreeWalkStop = "depth-limit" | "cycle";

/**
 * Output marker for a node the walk stopped at (`TreeWalkStop` → display text), matching the Java
 * `TreeWalk` reference wording exactly, for cross-port parity of rendered output.
 */
export const TREE_WALK_MARKER: Record<TreeWalkStop, string> = {
  "depth-limit": "… (depth limit)",
  cycle: "… (cycle)",
};

const MAX_DEPTH = 10_000;

/**
 * Bound and cycle guard shared by every recursive TraceNode/TraceTree-shaped walker (renderers,
 * exporters, aggregators): a 10,000-level depth cap plus identity-based cycle detection, so a
 * hand-built, replayed or deserialized tree — cyclic or merely very deep — can never crash a
 * walker with a stack overflow or grow its output/loop forever. Mirrors the Java `TreeWalk`
 * reference shape (`ai.narrativetrace.core.aggregate.TreeWalk`).
 *
 * INTENT: call {@link enter} immediately before descending into a node's children — the node's own
 * content is always produced first (a stopped node still "contributes itself", just not its
 * subtree). A defined return value means the walk must not descend further, and {@link exit} must
 * not be called for that node. Every `enter` that returns `undefined` must be paired with exactly
 * one `exit` for the same node on the way back out — a `try/finally` around the recursive step.
 *
 * @remarks Cycle detection is identity-based and path-scoped (a `Set` of the *current* ancestors,
 * not every node ever seen): the same node reached twice via two different, non-overlapping paths
 * (a diamond, shared not cyclic — e.g. two branches of a fork/join pointing at one captured value)
 * renders in full both times, exactly like {@link RenderWalk} in `value-renderer.ts` already does
 * for object graphs. One instance is scoped to a single top-level render call, never reused across
 * calls — a fresh `TreeWalk` per {@link enter}/{@link exit} pairing keeps one tree's traversal state
 * from leaking into another's.
 */
export class TreeWalk<T extends object> {
  private readonly path = new Set<T>();
  private depth = 0;

  /**
   * Attempts to step into `node`'s subtree.
   *
   * @returns `undefined` when the step is allowed (the caller must descend into `node`'s children
   * and then call {@link exit}); otherwise the reason descent must stop.
   */
  enter(node: T): TreeWalkStop | undefined {
    if (this.path.has(node)) return "cycle";
    if (this.depth >= MAX_DEPTH) return "depth-limit";
    this.path.add(node);
    this.depth++;
    return undefined;
  }

  /** Steps back out of `node`'s subtree. Always paired with an {@link enter} that returned `undefined`. */
  exit(node: T): void {
    this.depth--;
    this.path.delete(node);
  }
}

/** One node's place on the explicit walk stack: its children and how far into them we've gotten. */
interface WalkFrame<T> {
  readonly node: T;
  children: readonly T[] | undefined;
  index: number;
}

// TypeScript only extends its void-returning-callback leniency (any actual return value accepted)
// to a parameter typed exactly `void`, not `undefined`; every real caller's callback body has no
// return statement (inferred `void`), so `boolean | undefined` here would reject them all.
// biome-ignore lint/suspicious/noConfusingVoidType: deliberate, see above
type EnterCallback<T> = (node: T, stop: TreeWalkStop | undefined) => boolean | void;

/**
 * Depth-first pre-order walk of a `{children}`-shaped tree, bounded and cycle-safe via
 * {@link TreeWalk}. Explicit-stack (non-recursive) by construction — traversal depth is heap-
 * allocated, not JS call-stack depth, which is the actual reason a bound is needed here: a
 * moderately complex per-node callback can exhaust the real call stack at a small fraction of
 * `TreeWalk`'s own 10,000-level cap if it recurses natively, so nothing in this walk may call
 * itself.
 *
 * INTENT: the one shared traversal every simple flatten/count/find-style walker (no per-node
 * formatting state beyond depth) adopts, so none of them can crash on a cyclic or very deep tree.
 * A renderer with genuine per-node formatting state (indentation math, sibling segment planning)
 * still needs its own explicit-stack rewrite, but drives it with the same {@link TreeWalk} guard.
 *
 * @param onEnter called once per node, pre-order, with the reason the walk will not descend
 * further (`undefined` when it will). Returning `false` stops the entire walk immediately.
 * @param onExit called once per node the walk fully descended into (i.e. `onEnter` saw
 * `undefined`), after all of its descendants have been visited — never for a stopped node.
 */
export function walkPreOrder<T extends object>(
  roots: readonly T[],
  childrenOf: (node: T) => readonly T[],
  onEnter: EnterCallback<T>,
  onExit?: (node: T) => void,
): void {
  const walk = new TreeWalk<T>();
  const stack: WalkFrame<T>[] = roots.map((node) => ({ node, children: undefined, index: 0 }));
  stack.reverse();
  while (stack.length > 0) {
    if (!stepFrame(stack, walk, childrenOf, onEnter, onExit)) return;
  }
}

// One iteration of the explicit walk loop. Returns false when `onEnter` requested an early stop.
function stepFrame<T extends object>(
  stack: WalkFrame<T>[],
  walk: TreeWalk<T>,
  childrenOf: (node: T) => readonly T[],
  onEnter: EnterCallback<T>,
  onExit?: (node: T) => void,
): boolean {
  const frame = stack[stack.length - 1] as WalkFrame<T>;
  if (frame.children === undefined) return enterFrame(frame, stack, walk, childrenOf, onEnter);
  if (frame.index < frame.children.length) {
    const child = frame.children[frame.index++] as T;
    stack.push({ node: child, children: undefined, index: 0 });
    return true;
  }
  walk.exit(frame.node);
  onExit?.(frame.node);
  stack.pop();
  return true;
}

// The first visit to `frame`: applies the guard, reports the node, then either abandons the frame
// (stopped) or records its children so `stepFrame` can start descending into them.
function enterFrame<T extends object>(
  frame: WalkFrame<T>,
  stack: WalkFrame<T>[],
  walk: TreeWalk<T>,
  childrenOf: (node: T) => readonly T[],
  onEnter: EnterCallback<T>,
): boolean {
  const stop = walk.enter(frame.node);
  if (onEnter(frame.node, stop) === false) return false;
  if (stop !== undefined) {
    stack.pop();
    return true;
  }
  frame.children = childrenOf(frame.node);
  return true;
}
