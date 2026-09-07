// SPDX-License-Identifier: BUSL-1.1
// Licensed under the Business Source License 1.1 (see LICENSE); Change Date: four years from publication; Change License: Apache-2.0
// Copyright (c) 2026 Empower Agile
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import type { CorpusCase, GraphCase, HeaderCase, TemplateCase, TraceShapeCase } from "./types.js";

/**
 * Reader for the shared hostile corpus in `hostile-corpus/`.
 *
 * INTENT: one loader, so every property reads the same fixtures the same way. The corpus is the
 * cross-runtime artifact — every runtime copies it verbatim — so the same case hits every
 * TypeScript renderer; only this reader and the graph builder are per-runtime code.
 *
 * @llmNote The fixtures are ASCII: every hostile character is a `\uXXXX` escape that JSON.parse
 * turns back into the real code point here. A case may declare `repeat` instead of `value`, which
 * is how a 1 MiB input lives in a few kB of fixture; `prefix`/`suffix` bracket the repetition.
 */
const CORPUS_DIR = fileURLToPath(new URL("../../hostile-corpus/", import.meta.url));

// biome-ignore lint/suspicious/noExplicitAny: raw JSON shape, narrowed by the readers below
type RawCase = Record<string, any>;

const parsedFiles = new Map<string, RawCase>();

function readJson(fileName: string): RawCase {
  let parsed = parsedFiles.get(fileName);
  if (parsed === undefined) {
    parsed = JSON.parse(readFileSync(`${CORPUS_DIR}${fileName}`, "utf-8"));
    parsedFiles.set(fileName, parsed as RawCase);
  }
  return parsed as RawCase;
}

/** `prefix + unit x count + suffix`, or the literal `value`/`template` field. */
function materialize(node: RawCase, literalField: string): string {
  if (node.repeat === undefined) return node[literalField] ?? "";
  const { unit, count } = node.repeat as { unit: string; count: number };
  return (node.prefix ?? "") + unit.repeat(count) + (node.suffix ?? "");
}

/**
 * The raw case array under `field` of a parsed fixture, cast out of `any`.
 *
 * @remarks Without this, `readJson(...).cases.map(toCorpusCase)` assigns an `any`-typed
 * expression to a precisely-typed cache variable — TypeScript then widens the variable's narrowed
 * type to `any` for the rest of the function, silently defeating the `=== undefined` guard below.
 */
function rawCases(fileName: string, field: string): RawCase[] {
  return readJson(fileName)[field] as RawCase[];
}

let stringsCache: CorpusCase[] | undefined;
/** Hostile scalar values, for the renderer and every output format. */
export function hostileStrings(): readonly CorpusCase[] {
  if (stringsCache === undefined) {
    stringsCache = rawCases("strings.json", "cases").map(toCorpusCase);
  }
  return stringsCache;
}

let injectionsCache: CorpusCase[] | undefined;
/** Prompt-injection payloads, for the AI-consumer containment oracle. */
export function hostileInjections(): readonly CorpusCase[] {
  if (injectionsCache === undefined) {
    injectionsCache = rawCases("injection.json", "cases").map(toCorpusCase);
  }
  return injectionsCache;
}

function toCorpusCase(node: RawCase): CorpusCase {
  return { id: node.id, description: node.description, value: materialize(node, "value") };
}

let traceparentsCache: HeaderCase[] | undefined;
/** W3C `traceparent` header values, each saying whether the parser must accept it. */
export function hostileTraceparents(): readonly HeaderCase[] {
  if (traceparentsCache === undefined) {
    traceparentsCache = rawCases("headers.json", "traceparent").map(toHeaderCase);
  }
  return traceparentsCache;
}

let tracestatesCache: HeaderCase[] | undefined;
/** W3C `tracestate` header values. */
export function hostileTracestates(): readonly HeaderCase[] {
  if (tracestatesCache === undefined) {
    tracestatesCache = rawCases("headers.json", "tracestate").map(toHeaderCase);
  }
  return tracestatesCache;
}

function toHeaderCase(node: RawCase): HeaderCase {
  return {
    id: node.id,
    description: node.description,
    value: materialize(node, "value"),
    accepted: node.accepted ?? false,
  };
}

let templatesCache: TemplateCase[] | undefined;
/** `@narrated`/`@onError` template strings. */
export function hostileTemplates(): readonly TemplateCase[] {
  if (templatesCache === undefined) {
    templatesCache = rawCases("templates.json", "cases").map(toTemplateCase);
  }
  return templatesCache;
}

function toTemplateCase(node: RawCase): TemplateCase {
  return {
    id: node.id,
    description: node.description,
    template: materialize(node, "template"),
    values: node.values,
    ...(node.expect !== undefined && { expect: node.expect }),
  };
}

let graphsCache: GraphCase[] | undefined;
/** Declarative object-graph shapes; `hostileGraphs.build` turns one into a live graph. */
export function hostileGraphCases(): readonly GraphCase[] {
  if (graphsCache === undefined) {
    graphsCache = rawCases("graphs.json", "cases").map(toGraphCase);
  }
  return graphsCache;
}

function toGraphCase(node: RawCase): GraphCase {
  return {
    id: node.id,
    description: node.description,
    ...(node.kind !== undefined && { kind: node.kind }),
    layers: node.layers ?? [],
    ...(node.layer !== undefined && { layer: node.layer }),
    ...(node.container !== undefined && { container: node.container }),
    ...(node.member !== undefined && { member: node.member }),
    ...(node.state !== undefined && { state: node.state }),
    ...(node.payload !== undefined && { payload: node.payload }),
    n: node.n ?? 0,
  };
}

let traceShapesCache: TraceShapeCase[] | undefined;
/** Declarative `TraceNode` call-tree shapes; `traceShapes.build` turns one into a live tree. */
export function hostileTraceShapes(): readonly TraceShapeCase[] {
  if (traceShapesCache === undefined) {
    traceShapesCache = rawCases("trace-shapes.json", "cases").map(toTraceShapeCase);
  }
  return traceShapesCache;
}

function toTraceShapeCase(node: RawCase): TraceShapeCase {
  return { id: node.id, description: node.description, kind: node.kind, n: node.n };
}
