// SPDX-License-Identifier: BUSL-1.1
// Licensed under the Business Source License 1.1 (see LICENSE); Change Date: four years from publication; Change License: Apache-2.0
// Copyright (c) 2026 Empower Agile
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, test } from "vitest";
import {
  hostileGraphCases,
  hostileInjections,
  hostileStrings,
  hostileTemplates,
  hostileTraceparents,
  hostileTraceShapes,
  hostileTracestates,
} from "../src/corpus/hostile-corpus.js";
import { build, templateValues } from "../src/corpus/hostile-graphs.js";
import { build as buildTraceShape } from "../src/corpus/trace-shapes.js";

/**
 * The corpus is data copied verbatim from the Java golden source, so its shape is a contract in
 * its own right — mirrors Java's `HostileCorpusTest`. A fixture that silently stopped loading
 * would turn every property below it green without testing anything.
 */

const CORPUS_DIR = fileURLToPath(new URL("../hostile-corpus/", import.meta.url));
const EM_DASH = "—";

function stringCaseValue(id: string): string {
  const found = hostileStrings().find((c) => c.id === id);
  if (found === undefined) throw new Error(`no corpus case with id ${id}`);
  return found.value;
}

function assertUniqueIds(ids: readonly string[]): void {
  expect(new Set(ids).size).toBe(ids.length);
}

describe("hostile corpus", () => {
  test("every fixture loads with cases", () => {
    expect(hostileStrings().length).toBeGreaterThan(50);
    expect(hostileInjections().length).toBeGreaterThan(30);
    expect(hostileTraceparents().length).toBeGreaterThan(30);
    expect(hostileTracestates().length).toBeGreaterThan(5);
    expect(hostileTemplates().length).toBeGreaterThan(30);
    expect(hostileGraphCases().length).toBeGreaterThan(40);
    expect(hostileTraceShapes().length).toBeGreaterThan(3);
  });

  test("case identifiers are unique within each fixture", () => {
    assertUniqueIds(hostileStrings().map((c) => c.id));
    assertUniqueIds(hostileInjections().map((c) => c.id));
    assertUniqueIds(hostileTraceparents().map((c) => c.id));
    assertUniqueIds(hostileTemplates().map((c) => c.id));
    assertUniqueIds(hostileGraphCases().map((c) => c.id));
    assertUniqueIds(hostileTraceShapes().map((c) => c.id));
  });

  test("every case carries a description saying what breaks", () => {
    for (const c of hostileStrings()) expect(c.description).not.toBe("");
    for (const c of hostileGraphCases()) expect(c.description).not.toBe("");
    for (const c of hostileTraceShapes()) expect(c.description).not.toBe("");
  });

  test("the generated cases materialize to the size they claim", () => {
    expect(stringCaseValue("long-1mib")).toHaveLength(1024 * 1024);
    expect(stringCaseValue("long-512")).toHaveLength(512);
    expect(stringCaseValue("long-truncation-boundary")).toHaveLength(200);
    expect(stringCaseValue("long-astral")).toHaveLength(300);
  });

  test("the escaped cases carry the code points they name", () => {
    expect(stringCaseValue("nul")).toBe(String.fromCodePoint(0x0000));
    expect(stringCaseValue("rtl-override").startsWith(String.fromCodePoint(0x202e))).toBe(true);
    expect(stringCaseValue("unpaired-high-surrogate")).toBe(String.fromCharCode(0xd800));
    expect(stringCaseValue("unpaired-low-surrogate")).toBe(String.fromCharCode(0xdc00));
    expect(stringCaseValue("zero-width")).toContain(String.fromCodePoint(0x200b));
    expect(stringCaseValue("zero-width")).toContain(String.fromCodePoint(0x2060));
  });

  test.each([
    "strings.json",
    "headers.json",
    "templates.json",
    "graphs.json",
    "injection.json",
    "trace-shapes.json",
  ])("%s stays ASCII on disk", (fileName) => {
    const text = readFileSync(`${CORPUS_DIR}${fileName}`, "utf-8");
    const offending = new Set<number>();
    for (const ch of text) {
      const code = ch.codePointAt(0) ?? 0;
      if (code > 126 && code !== EM_DASH.codePointAt(0)) offending.add(code);
    }
    expect([...offending], `${fileName} must spell hostile characters as escapes`).toEqual([]);
  });

  test("every declared graph shape builds", () => {
    for (const graphCase of hostileGraphCases()) {
      expect(() => build(graphCase, "sentinel-probe"), `graph shape ${graphCase.id}`).not.toThrow();
    }
  });

  test("every declared trace shape builds", () => {
    for (const shapeCase of hostileTraceShapes()) {
      expect(() => buildTraceShape(shapeCase), `trace shape ${shapeCase.id}`).not.toThrow();
    }
  });

  test("every template fixture name resolves to a graph", () => {
    for (const templateCase of hostileTemplates()) {
      expect(
        () => templateValues(templateCase.values, "sentinel-probe"),
        `template case ${templateCase.id} names an unknown fixture`,
      ).not.toThrow();
    }
  });

  test("the header fixture marks both outcomes", () => {
    expect(hostileTraceparents().some((h) => h.accepted)).toBe(true);
    expect(hostileTraceparents().some((h) => !h.accepted)).toBe(true);
  });
});
