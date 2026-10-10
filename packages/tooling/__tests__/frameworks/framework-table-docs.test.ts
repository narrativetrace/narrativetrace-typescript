// SPDX-License-Identifier: BUSL-1.1
// Licensed under the Business Source License 1.1 (see LICENSE); Change Date: four years from publication; Change License: Apache-2.0
// Copyright (c) 2026 Empower Agile
import { describe, expect, test } from "vitest";
import { FRAMEWORK_ROWS } from "../../src/frameworks/framework-table.js";
import {
  llmsFullFrameworkSection,
  llmsTxtCoveredFrameworks,
  spliceBlock,
} from "../../src/frameworks/framework-table-docs.js";
import { wiringSnippet } from "../../src/frameworks/wiring-snippets.js";

const PINO_FIXTURE = "packages/pino/__tests__/wiring/narrative-pipeline.ts";

describe("llmsFullFrameworkSection", () => {
  const section = llmsFullFrameworkSection("9.9.9");

  test("has one table line per row, naming its check", () => {
    const lines = section.split("\n");
    for (const row of FRAMEWORK_ROWS) {
      const line = lines.find((l) => l.startsWith(`| ${row.name} |`));
      expect(line, row.id).toContain(`\`${row.check.id}\``);
    }
  });

  test("pins the install line to the version it is given, with npm", () => {
    expect(section).toContain("`npm install @narrativetrace/express@9.9.9 ");
    expect(section).not.toContain("@narrativetrace/express@<");
  });

  test("marks the row an existing check covers, and the rows with no integration", () => {
    expect(section).toContain("`trap.silent-sink` (existing)");
    expect(section).toContain("| Fastify | a fastify dependency | — |");
    expect(section).toContain("`config.fastify-integration` (reports it)");
  });

  test("embeds each fixture once, under snippet markers, even when two rows share it", () => {
    expect(section.split(`<!-- snippet: ${PINO_FIXTURE} -->`)).toHaveLength(2);
    expect(section).toContain(`\`\`\`ts\n${wiringSnippet(PINO_FIXTURE)}\`\`\`\n<!-- /snippet -->`);
  });

  test("embeds what the caller says a fixture holds, not the carried copy", () => {
    const fresh = llmsFullFrameworkSection("1.0.0", (fixture) => `// fresh ${fixture}\n`);
    expect(fresh).toContain(`// fresh ${PINO_FIXTURE}\n\`\`\``);
  });

  test("says what the table is and what a reader may rely on", () => {
    expect(section).toContain("### Framework table — what the doctor checks");
    expect(section).toContain("ships inside `@narrativetrace/tooling`");
    expect(section).toContain(
      "detected but its integration is not installed, or installed but never wired",
    );
    expect(section).toContain("so an agent leaves it alone rather than guessing one.");
    expect(section).toContain(
      "| Framework | Detected by | Install (npm) | Wiring | Doctor check |",
    );
  });

  test("a no-integration row has no wiring section", () => {
    expect(section).not.toContain("#### Fastify");
  });
});

describe("llmsTxtCoveredFrameworks", () => {
  test("names every row and the check that observes it, in table order", () => {
    const line = llmsTxtCoveredFrameworks();
    const positions = FRAMEWORK_ROWS.map((row) => line.indexOf(`${row.name} (`));
    expect(positions.every((position) => position >= 0)).toBe(true);
    expect([...positions].sort((a, b) => a - b)).toEqual(positions);
    expect(line).toContain("Express (`config.express-middleware`)");
    expect(line).toContain("Koa (no integration shipped, `config.koa-integration` reports it)");
    expect(line.endsWith(".")).toBe(true);
  });
});

describe("spliceBlock", () => {
  const page = "intro\n<!-- t:begin -->\nold\n<!-- t:end -->\noutro\n";

  test("replaces only what sits between the markers", () => {
    expect(spliceBlock(page, "t", "new\n")).toBe(
      "intro\n<!-- t:begin -->\nnew\n<!-- t:end -->\noutro\n",
    );
  });

  test("finds a begin marker at the very start of the page", () => {
    expect(spliceBlock("<!-- t:begin -->\nold\n<!-- t:end -->", "t", "new\n")).toBe(
      "<!-- t:begin -->\nnew\n<!-- t:end -->",
    );
  });

  test("fills a block that is empty today", () => {
    expect(spliceBlock("<!-- t:begin -->\n<!-- t:end -->", "t", "new\n")).toBe(
      "<!-- t:begin -->\nnew\n<!-- t:end -->",
    );
  });

  test("is idempotent", () => {
    const once = spliceBlock(page, "t", "new\n");
    expect(spliceBlock(once, "t", "new\n")).toBe(once);
  });

  test.each([
    ["no begin marker", "<!-- t:end -->"],
    ["no end marker", "<!-- t:begin -->\n"],
    ["the end before the begin", "<!-- t:end -->\n<!-- t:begin -->\n"],
    ["another block's markers", "<!-- u:begin -->\n<!-- u:end -->"],
  ])("refuses a page with %s", (_name, text) => {
    expect(() => spliceBlock(text, "t", "x")).toThrow(
      "the document has no t:begin / t:end marker pair, in that order",
    );
  });
});
