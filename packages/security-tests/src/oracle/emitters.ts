// SPDX-License-Identifier: BUSL-1.1
// Licensed under the Business Source License 1.1 (see LICENSE); Change Date: four years from publication; Change License: Apache-2.0
// Copyright (c) 2026 Empower Agile
import { mkdtempSync, readdirSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { analyzeClarity, exportClarityJson } from "@narrativetrace/clarity";
import {
  exportCanonicalJson,
  exportChapter,
  exportJson,
  incomplete,
  methodSignature,
  parameterCapture,
  renderIndentedText,
  renderMarkdown,
  renderMarkdownDocument,
  renderProse,
  returned,
  type TraceTree,
  threw,
  traceNode,
  traceTree,
} from "@narrativetrace/core";
import { renderMermaidSequence, renderPlantUmlSequence } from "@narrativetrace/diagrams";
import { type TraceFormat, writeTraceOutput } from "@narrativetrace/vitest";

/**
 * Every output NarrativeTrace-TS can produce from one trace, in one map.
 *
 * INTENT: an oracle that names the formats it checks goes stale the moment a format is added. The
 * suite asserts over *this* map, so a new emitter added here is immediately covered by redaction,
 * well-formedness, injection containment and boundedness at once.
 *
 * @llmNote This runtime has no structural (`.nt`) renderer yet (nothing exists) and
 * no standalone `FrontmatterBuilder`/`mermaid-aliases` variant (`renderMermaidSequence` always
 * aliases participants, so there is only one Mermaid renderer here, not two). Both are documented
 * absences, not oversights — the shared fuzz-suite convention records why.
 */

/** The scenario name every artifact is written under, unless a test supplies its own. */
export const SCENARIO = "a hostile scenario";

const MODULE_NAME = "HostileTest";
const TEST_NAME = "rendersHostileInput";
const ALL_FORMATS: readonly TraceFormat[] = [
  "md",
  "mmd",
  "json",
  "puml",
  "clarity-json",
  "canonical-json",
];

/** A one-node tree whose parameter and return value carry the given rendered text. */
export function treeOf(renderedArgument: string, renderedReturn: string): TraceTree {
  const node = traceNode(
    methodSignature("CardRepository", "findByNumber", [
      parameterCapture("probe", renderedArgument, false),
    ]),
    returned(renderedReturn),
    [],
    1,
  );
  return traceTree([node]);
}

/** A one-node tree whose narration and error context carry the given prose. */
export function treeNarrating(narration: string, errorContext: string): TraceTree {
  const node = traceNode(
    methodSignature("PaymentService", "charge", [], { narration, errorContext }),
    returned("true"),
    [],
    1,
  );
  return traceTree([node]);
}

/** A one-node tree that threw, so the exception-message paths are exercised. */
export function treeThrowing(thrown: unknown): TraceTree {
  const node = traceNode(methodSignature("PaymentService", "charge", []), threw(thrown), [], 1);
  return traceTree([node]);
}

/** An `Error` whose reported type name is `typeName` rather than its class's real name. */
function errorNamed(typeName: string, message: string): Error {
  class HostileTypeError extends Error {}
  Object.defineProperty(HostileTypeError, "name", { value: typeName });
  return new HostileTypeError(message);
}

/**
 * A one-node tree whose className, methodName, a parameter name and the reported exception type
 * all carry `hostile` at once — metadata treated as attacker-controlled input, not just captured
 * values. `renderValue`/`renderStructured` already escape everything captured *values* carry
 * (`treeOf`, `treeThrowing`); this exercises the parallel gap fuzzing values alone cannot reach,
 * since every other tree builder here uses a fixed, hand-picked className/methodName (cross-runtime
 * shape F4, 2026-09-02 audit).
 */
export function treeWithHostileMetadata(hostile: string): TraceTree {
  const node = traceNode(
    methodSignature(hostile, hostile, [parameterCapture(hostile, '"value"', false)]),
    threw(errorNamed(hostile, "boom")),
    [],
    1,
  );
  return traceTree([node]);
}

/** A one-node tree whose outcome never arrived, so the incomplete-outcome paths are exercised. */
export function treeIncomplete(): TraceTree {
  const node = traceNode(methodSignature("PaymentService", "charge", []), incomplete(), [], 1);
  return traceTree([node]);
}

/**
 * The in-memory renderers, which a library consumer calls directly.
 *
 * @param scenario the value every scenario-bearing output carries — a route of its own,
 * caller-supplied text that reaches the YAML frontmatter, the Markdown body header and the JSON
 * scenario name, each with its own escaping decision. Defaults to {@link SCENARIO} so every
 * existing caller that fixed the scenario to a benign constant is unaffected; a caller fuzzing the
 * scenario route passes the hostile value here instead of only through a tree's captured
 * values/narration — a Markdown body-header escaping gap in the Java golden source was reachable
 * only through this parameter.
 */
export function renderers(tree: TraceTree, scenario: string = SCENARIO): Record<string, string> {
  const metadata = { scenario };
  return {
    "renderer:prose": renderProse(tree),
    "renderer:indented": renderIndentedText(tree),
    "renderer:markdown": renderMarkdown(tree, { scenarioName: scenario }),
    "renderer:markdown-document": renderMarkdownDocument(tree, {
      scenario,
      result: "success",
    }),
    "renderer:json": exportJson(tree, metadata),
    "renderer:chapter-json": exportChapter(tree, metadata),
    "renderer:canonical-json": exportCanonicalJson(tree),
    "renderer:clarity-json": exportClarityJson(analyzeClarity(tree), metadata),
    "renderer:mermaid": renderMermaidSequence(tree),
    "renderer:plantuml": renderPlantUmlSequence(tree),
  };
}

/**
 * Every output the product can produce from `tree`, keyed by emitter: the in-memory renderers plus
 * everything the shipped writer puts on disk.
 */
export function everyOutput(tree: TraceTree): Record<string, string> {
  const outputs = renderers(tree);
  const dir = mkdtempSync(join(tmpdir(), "narrativetrace-security-"));
  try {
    Object.assign(outputs, writtenArtifacts(tree, dir));
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
  return outputs;
}

/** Everything the shipped writer puts on disk for one test's trace. */
export function writtenArtifacts(tree: TraceTree, dir: string): Record<string, string> {
  return writtenArtifactsNamed(tree, dir, MODULE_NAME, TEST_NAME);
}

/**
 * The same, under a caller-supplied module/test name.
 *
 * INTENT: the artifact writer's *other* hostile input — not the value, the name. `writeTraceOutput`
 * is public API whose callers do not all derive a module/test name from a JS identifier; a scenario
 * name, an HTTP route or a generated property-test description reaches it in real integrations, and
 * that name becomes a path component.
 */
export function writtenArtifactsNamed(
  tree: TraceTree,
  dir: string,
  moduleName: string,
  testName: string,
): Record<string, string> {
  writeTraceOutput(tree, {
    outputDir: dir,
    moduleName,
    testName,
    formats: ALL_FORMATS,
  });
  const outputs: Record<string, string> = {};
  for (const file of walk(dir)) {
    outputs[`artifact:${file.split("/").pop()}`] = readFileSync(file, "utf-8");
  }
  return outputs;
}

function walk(dir: string): string[] {
  const files: string[] = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) files.push(...walk(full));
    else files.push(full);
  }
  return files;
}
