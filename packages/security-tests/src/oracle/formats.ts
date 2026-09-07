// SPDX-License-Identifier: BUSL-1.1
// Licensed under the Business Source License 1.1 (see LICENSE); Change Date: four years from publication; Change License: Apache-2.0
// Copyright (c) 2026 Empower Agile
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import Ajv2020, { type ValidateFunction } from "ajv/dist/2020.js";
import addFormats from "ajv-formats";
import { expect } from "vitest";
import { parse as parseYaml } from "yaml";

/**
 * Well-formedness oracles: each format read back by a real parser for that format.
 *
 * INTENT: "the output looks fine" is not an oracle. Reading back with the consumer's own parser
 * is the only check that catches an escaper that is merely plausible.
 *
 * @llmNote The canonical schema is read from `schema/` at the repository root — copied verbatim
 * from the Java golden source (see `schema/README.md`) — rather than duplicated here, so this
 * suite validates against the same document every port and every writer-conformance test does.
 */

const SCHEMA_DIR = fileURLToPath(new URL("../../../../schema/", import.meta.url));

function compileSchema(fileName: string): ValidateFunction {
  const ajv = new Ajv2020({ strict: false, allErrors: true });
  addFormats(ajv);
  return ajv.compile(JSON.parse(readFileSync(`${SCHEMA_DIR}${fileName}`, "utf-8")));
}

let chapterTreeSchema: ValidateFunction | undefined;

/** Parses `json`, failing with the emitter's name when it does not parse. */
export function parseJson(emitter: string, json: string): unknown {
  try {
    return JSON.parse(json);
  } catch (error) {
    throw new Error(`${emitter} produced JSON no parser accepts: ${(error as Error).message}`);
  }
}

/** Validates a chapter-tree document against the canonical schema. */
export function validatesAgainstChapterTreeSchema(emitter: string, json: string): void {
  chapterTreeSchema ??= compileSchema("chapter-tree.schema.json");
  const document = parseJson(emitter, json);
  const valid = chapterTreeSchema(document);
  const violations = (chapterTreeSchema.errors ?? [])
    .map((e) => `${e.instancePath || "/"} ${e.message}`)
    .join("; ");
  expect(valid, `${emitter} violates the canonical chapter-tree schema: ${violations}`).toBe(true);
}

const MERMAID_STATEMENT = /^(participant .*|.*->>.*: .*|.*-->>.*: .*|.*-x.*: .*|Note over .*: .*)$/;

/** The statement lines of a diagram: no blanks, no `%%` comments, indentation stripped. */
export function statementsOf(diagram: string): string[] {
  return diagram
    .split("\n")
    .slice(1)
    .map((line) => line.trim())
    .filter((line) => line.length > 0 && !line.startsWith("%%"));
}

function hasControlCharacter(line: string): boolean {
  for (const ch of line) {
    const code = ch.codePointAt(0) ?? 0;
    if (code <= 0x1f || (code >= 0x7f && code <= 0x9f)) return true;
  }
  return false;
}

/**
 * A Mermaid sequence diagram is well formed when it opens with its keyword and every other line
 * is one statement the grammar allows — no raw line break inside a label, no injected directive.
 */
export function isWellFormedMermaid(emitter: string, diagram: string): void {
  expect(diagram, `${emitter} must open the diagram`).toMatch(/^sequenceDiagram/);
  for (const line of statementsOf(diagram)) {
    expect(line, `${emitter} emitted a line the Mermaid grammar does not allow`).toMatch(
      MERMAID_STATEMENT,
    );
    expect(
      hasControlCharacter(line),
      `${emitter} left a control character inside a diagram line`,
    ).toBe(false);
  }
}

/** A PlantUML diagram is well formed when it is bracketed by its own markers. */
export function isWellFormedPlantUml(emitter: string, diagram: string): void {
  const trimmed = diagram.trimEnd();
  expect(trimmed.startsWith("@startuml"), `${emitter} must open the diagram`).toBe(true);
  expect(trimmed.endsWith("@enduml"), `${emitter} must close the diagram`).toBe(true);
}

/** The text between the opening and closing `---` fences. */
function frontmatterBlock(emitter: string, markdown: string): string {
  expect(markdown.startsWith("---\n"), `${emitter} must open with a frontmatter fence`).toBe(true);
  const end = markdown.indexOf("\n---", "---\n".length);
  expect(end, `${emitter} left the frontmatter block unterminated`).toBeGreaterThanOrEqual(0);
  return markdown.slice("---\n".length, end);
}

/** Reads the YAML frontmatter block of a Markdown document with a real YAML parser. */
export function frontmatterOf(emitter: string, markdown: string): Record<string, unknown> {
  const block = frontmatterBlock(emitter, markdown);
  let parsed: unknown;
  try {
    parsed = parseYaml(block);
  } catch (error) {
    throw new Error(
      `${emitter} produced frontmatter no YAML parser accepts: ${(error as Error).message}`,
    );
  }
  expect(
    parsed !== null && typeof parsed === "object" && !Array.isArray(parsed),
    `${emitter} frontmatter must be a mapping`,
  ).toBe(true);
  return parsed as Record<string, unknown>;
}

/** Every artifact whose name ends in `.json` parses, whichever writer produced it. */
export function everyJsonArtifactParses(outputs: Readonly<Record<string, string>>): void {
  for (const [emitter, output] of Object.entries(outputs)) {
    if (emitter.endsWith(".json") || emitter === "renderer:json") {
      parseJson(emitter, output);
    }
  }
}

/**
 * The document's shape with every scalar's *content* erased: field names, array lengths and node
 * kinds only.
 *
 * INTENT: the AI-consumer oracle's comparison. A captured value that stayed one value produces the
 * same shape whatever it contained; a value that broke out of its string produces a different one.
 */
export function jsonShape(node: unknown): string {
  if (Array.isArray(node)) return `[${node.map(jsonShape).join("")}]`;
  if (node !== null && typeof node === "object") {
    const entries = Object.entries(node as Record<string, unknown>)
      .map(([key, value]) => `${key}:${jsonShape(value)},`)
      .join("");
    return `{${entries}}`;
  }
  if (node === null) return "null";
  return typeof node;
}

/**
 * Every string node under `node` whose field is `fieldName`, in document order — used to read a
 * captured value back out of the document a parser produced.
 */
export function stringsNamed(node: unknown, fieldName: string): string[] {
  const found: string[] = [];
  collectStrings(node, fieldName, found);
  return found;
}

function collectStrings(node: unknown, fieldName: string, found: string[]): void {
  if (Array.isArray(node)) {
    for (const element of node) collectStrings(element, fieldName, found);
  } else if (node !== null && typeof node === "object") {
    for (const [key, value] of Object.entries(node as Record<string, unknown>)) {
      if (key === fieldName && typeof value === "string") found.push(value);
      collectStrings(value, fieldName, found);
    }
  }
}

/** How many fenced-code delimiters a Markdown document carries. */
export function fenceCount(markdown: string): number {
  return markdown.split("\n").filter((line) => line.trim().startsWith("```")).length;
}

/** How many frontmatter fences a Markdown document carries: exactly two, or it is broken. */
export function frontmatterFenceCount(markdown: string): number {
  return markdown.split("\n").filter((line) => line.trim() === "---").length;
}
