// SPDX-License-Identifier: BUSL-1.1
// Licensed under the Business Source License 1.1 (see LICENSE); Change Date: four years from publication; Change License: Apache-2.0
// Copyright (c) 2026 Empower Agile
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * `documentation/llms.txt` ends with an index of what the Complete Reference holds. A line in that
 * index is a promise to an agent that reads only the index, so each one must name a heading that
 * `llms-full.md` really has — the index once promised "Runtime adapters" and "Observability"
 * sections the reference did not contain (found by the 2026-10-09 audit).
 */
const ROOT = join(import.meta.dirname, "..");

/** Index label → the `llms-full.md` heading that delivers it, one row per index line. */
const DELIVERED_BY: ReadonlyMap<string, string> = new Map([
  ["Overview and philosophy", "Overview"],
  ["Quick start (install and trace)", "Quick Start"],
  ["Package map with dependency graph (18 published packages)", "Package Map"],
  ["Core API", "Core API Reference"],
  ["Data model", "TraceTree, TraceNode, and data model"],
  ["Proxy API", "Proxy API Reference"],
  ["Concurrency", "Concurrency"],
  ["Vitest API", "Vitest API Reference"],
  ["Diagrams API", "Diagrams API Reference"],
  ["Clarity API", "Clarity API Reference"],
  ["Runtime Adapters API", "Runtime Adapters API Reference"],
  ["Observability API", "Observability API Reference"],
  ["Configuration", "Configuration"],
  ["Architecture decisions", "Architecture Decisions"],
  ["Troubleshooting", "Troubleshooting"],
]);

function read(relative: string): string {
  return readFileSync(join(ROOT, relative), "utf-8");
}

function indexLabels(): string[] {
  const text = read("documentation/llms.txt");
  const section = text.split("## Sections in Complete Reference\n")[1] ?? "";
  return section
    .split("\n")
    .filter((line) => line.startsWith("- "))
    .map((line) => line.slice(2).split(":")[0] ?? "");
}

function headings(): string[] {
  return read("documentation/llms-full.md")
    .split("\n")
    .filter((line) => /^#{2,3} /.test(line))
    .map((line) => line.replace(/^#+ /, ""));
}

describe("llms.txt's index of the Complete Reference", () => {
  it("has a decided heading for every line it lists, and lists nothing undecided", () => {
    expect(indexLabels()).toEqual([...DELIVERED_BY.keys()]);
  });

  it.each([
    ...DELIVERED_BY,
  ])("promises '%s' and llms-full.md has the heading '%s'", (_label, heading) => {
    expect(headings()).toContain(heading);
  });

  it("links the framework integration guide, which the runtime adapter section defers to", () => {
    expect(read("documentation/llms.txt")).toContain("(framework-integration-guide.md)");
    expect(read("documentation/llms-full.md")).toContain("(framework-integration-guide.md)");
  });
});
