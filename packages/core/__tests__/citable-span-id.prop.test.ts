// SPDX-License-Identifier: BUSL-1.1
// Licensed under the Business Source License 1.1 (see LICENSE); Change Date: four years from publication; Change License: Apache-2.0
// Copyright (c) 2026 Empower Agile
import fc from "fast-check";
import { describe, expect, test } from "vitest";
import {
  CitableSpanId,
  type ConcurrencyKind,
  concurrencyInfo,
  methodSignature,
  renderIndentedText,
  renderMarkdownBody,
  renderProse,
  renderStructural,
  returned,
  type TraceNode,
  type TraceTree,
  traceNode,
  traceTree,
} from "../src/index.js";

/**
 * Phase 7 D8: span ids are DERIVED from tree position, so the `.nt` prints exactly one id per
 * tree position, each id leads to the call whose line carries it, and every other flavour cites
 * the same span by the same id. Port of Java `SpanIdBijectionPropertyTest`.
 *
 * The oracle never calls a renderer: it resolves an id by walking the tree path by path, numbering
 * one node's children segment by segment exactly as the format spec states it — a fork or async
 * group's members by `Class.method` (stable), a fire-and-forget launch as ONE position whose
 * launched work (this runtime tags the workers themselves) is its own sibling list.
 */

const CLASSES = ["Alpha", "Bravo", "Charlie"];
const METHODS = ["run", "check", "send"];

/** A position in the oracle's tree: a call, or a fire-and-forget launch holding its workers. */
type Position = { readonly node: TraceNode } | { readonly launched: readonly TraceNode[] };

let groups = 0;

/** A seeded mulberry32: fast-check shrinks the seed, the tree is a pure function of it. */
class Rand {
  private state: number;
  constructor(seed: number) {
    this.state = seed >>> 0;
  }
  /** An integer in `[min, max]`, inclusive. */
  nextInt(min: number, max: number): number {
    this.state = (this.state + 0x6d2b79f5) >>> 0;
    let t = this.state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    const unit = ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    return min + Math.floor(unit * (max - min + 1));
  }
}

function call(rand: Rand, depth: number, info?: ReturnType<typeof concurrencyInfo>) {
  const sig = methodSignature(
    CLASSES[rand.nextInt(0, 2)] as string,
    METHODS[rand.nextInt(0, 2)] as string,
    [],
  );
  const children = depth < 3 ? siblings(rand, depth + 1) : [];
  return traceNode(sig, returned(null), children, 0, 0, info);
}

function group(rand: Rand, depth: number, kind: ConcurrencyKind): TraceNode[] {
  const info = concurrencyInfo(`g${++groups}`, "task", kind);
  return Array.from({ length: rand.nextInt(1, 3) }, () => call(rand, depth, info));
}

/** A sibling list mixing plain calls, fork and async groups, and fire-and-forget launches. */
function siblings(rand: Rand, depth: number): TraceNode[] {
  const out: TraceNode[] = [];
  for (let i = rand.nextInt(0, depth === 0 ? 3 : 2); i > 0; i--) {
    const roll = rand.nextInt(0, 5);
    if (roll === 3) out.push(...group(rand, depth, "fork-join"));
    else if (roll === 4) out.push(...group(rand, depth, "async"));
    else if (roll === 5) out.push(...group(rand, depth, "fire-and-forget"));
    else out.push(call(rand, depth));
  }
  return out;
}

const trees = fc.integer().map((seed) => traceTree(siblings(new Rand(seed), 0)));

function key(node: TraceNode): string {
  return `${node.signature.className}.${node.signature.methodName}`;
}

/** One sibling list in id order, each position a call or a launch. */
function positions(list: readonly TraceNode[]): Position[] {
  const out: Position[] = [];
  for (let i = 0; i < list.length; ) {
    const groupId = list[i]?.concurrency?.groupId;
    let end = i + 1;
    while (
      groupId !== undefined &&
      end < list.length &&
      list[end]?.concurrency?.groupId === groupId
    )
      end++;
    const segment = list.slice(i, end);
    if (list[i]?.concurrency?.kind === "fire-and-forget") out.push({ launched: segment });
    else {
      const ordered =
        groupId === undefined
          ? segment
          : [...segment].sort((a, b) => (key(a) < key(b) ? -1 : key(a) > key(b) ? 1 : 0));
      out.push(...ordered.map((node) => ({ node })));
    }
    i = end;
  }
  return out;
}

/** A position's own sibling list: a call's children, or a launch's workers as plain positions. */
function below(position: Position): Position[] {
  return "node" in position
    ? positions(position.node.children)
    : position.launched.map((node) => ({ node }));
}

function resolve(tree: TraceTree, id: string): Position | undefined {
  let list = positions(tree.roots);
  let found: Position | undefined;
  for (const step of id.slice(1).split(".")) {
    found = list[Number(step) - 1];
    if (found === undefined) return undefined;
    list = below(found);
  }
  return found;
}

function countPositions(list: readonly Position[]): number {
  return list.reduce((sum, p) => sum + 1 + countPositions(below(p)), 0);
}

describe("citable span ids — a bijection with tree positions, the same in every flavour", () => {
  test("the structural trace prints every tree position exactly once, on its own line", () => {
    fc.assert(
      fc.property(trees, (tree) => {
        const printed: string[] = [];
        for (const line of renderStructural(tree).split("\n")) {
          const id = CitableSpanId.of(line);
          if (id === undefined) continue;
          printed.push(id);
          const position = resolve(tree, id);
          expect(position, `${id} resolves`).toBeDefined();
          const named =
            position && "node" in position ? `${key(position.node)}(` : "~ fire-and-forget";
          expect(line).toContain(named);
        }
        expect(new Set(printed).size).toBe(printed.length);
        expect(printed).toHaveLength(countPositions(positions(tree.roots)));
      }),
      { numRuns: 300 },
    );
  });

  test("every other flavour cites only ids the .nt prints, each on its own span's line", () => {
    fc.assert(
      fc.property(trees, (tree) => {
        const structural = new Set(
          renderStructural(tree)
            .split("\n")
            .map((line) => CitableSpanId.of(line))
            .filter((id): id is string => id !== undefined),
        );
        const cited = [
          ...trailing(renderIndentedText(tree)),
          ...trailing(renderMarkdownBody(tree)),
          ...parenthesized(renderProse(tree)),
        ];
        for (const { id, text } of cited) {
          expect(structural.has(id), `${id} exists in the .nt`).toBe(true);
          const position = resolve(tree, id);
          if (position && "node" in position)
            expect(text).toContain(position.node.signature.className);
        }
      }),
      { numRuns: 300 },
    );
  });
});

function trailing(text: string): { id: string; text: string }[] {
  return text.split("\n").flatMap((line) => {
    const id = line.slice(line.lastIndexOf(" ") + 1);
    return CitableSpanId.isWellFormed(id) ? [{ id, text: line }] : [];
  });
}

/** Prose cites `(#1.2)` after the action; the class precedes it in the same clause. */
function parenthesized(text: string): { id: string; text: string }[] {
  return [...text.matchAll(/((?:[^.(]|\.(?! ))*)\((#[\d.]+)\)/g)].flatMap((m) =>
    CitableSpanId.isWellFormed(m[2] as string)
      ? [{ id: m[2] as string, text: humanless(m[1] as string) }]
      : [],
  );
}

/** Prose de-camel-cases class names; this oracle's class names are single capitalized words. */
function humanless(clause: string): string {
  return clause.replace(/\b([a-z])([a-z]+)\b/g, (_w, a: string, b: string) => a.toUpperCase() + b);
}
