// SPDX-License-Identifier: BUSL-1.1
// Licensed under the Business Source License 1.1 (see LICENSE); Change Date: four years from publication; Change License: Apache-2.0
// Copyright (c) 2026 Empower Agile
import { describe, expect, test } from "vitest";
import type { PlatformRow } from "../../src/platforms/platform-row.js";
import { PLATFORM_ROWS } from "../../src/platforms/platform-table.js";
import {
  PLATFORM_TABLE_BLOCK,
  platformTableMarkdown,
  splicePlatformTable,
  USE_WITH_YOUR_AGENT,
} from "../../src/platforms/platform-table-docs.js";

describe("the platform table, rendered for readers", () => {
  test("has one row per platform in table order under one header", () => {
    const table = platformTableMarkdown();
    expect(
      table.startsWith(
        "| Platform | How a stranger gets the skills | What the agent finds after `init` |" +
          " Evidence | Verified |\n|---|---|---|---|---|\n",
      ),
    ).toBe(true);
    let last = -1;
    for (const row of PLATFORM_ROWS) {
      const at = table.indexOf(`| ${row.name} |`);
      expect(at, row.id).toBeGreaterThan(last);
      last = at;
      for (const cell of [row.installPath, row.agentFinds, row.verified]) {
        expect(table).toContain(cell);
      }
    }
    expect(table.trimEnd().split("\n")).toHaveLength(2 + PLATFORM_ROWS.length);
  });

  test("a row names its evidence lane, or says it is a manual trial", () => {
    const table = platformTableMarkdown();
    expect(table).toContain("Tier B lane `cursor`");
    expect(table).toContain("Tier B lane `antigravity`");
    expect(table).toContain("manual trial");
  });

  test("no cell breaks the table with a pipe or a newline", () => {
    const table = platformTableMarkdown();
    for (const line of table.trimEnd().split("\n").slice(2)) {
      expect(line.split(/(?<!\\)\|/)).toHaveLength(7);
    }
  });

  test("every data line is one row: it opens and closes with a pipe, never run into the next", () => {
    const lines = platformTableMarkdown().trimEnd().split("\n").slice(2);
    for (const line of lines) {
      expect(line.startsWith("| ")).toBe(true);
      expect(line.endsWith(" |")).toBe(true);
    }
  });

  test("escapes a pipe and flattens a newline inside a cell, so a row keeps its columns", () => {
    const hostile = { ...PLATFORM_ROWS[0], installPath: "a | b\nc" } as PlatformRow;
    const [row] = platformTableMarkdown([hostile]).trimEnd().split("\n").slice(2);
    expect(row).toContain("a \\| b c");
    expect(row?.split(/(?<!\\)\|/)).toHaveLength(7);
  });

  test("splices the table between its markers and nowhere else, idempotently", () => {
    const page = `before\n<!-- ${PLATFORM_TABLE_BLOCK}:begin -->\nstale\n<!-- ${PLATFORM_TABLE_BLOCK}:end -->\nafter\n`;
    const rendered = splicePlatformTable(page);
    expect(rendered.startsWith("before\n<!-- platform-table:begin -->\n| Platform |")).toBe(true);
    expect(rendered.endsWith("<!-- platform-table:end -->\nafter\n")).toBe(true);
    expect(rendered).not.toContain("stale");
    expect(splicePlatformTable(rendered)).toBe(rendered);
  });

  test("refuses a page that lost its markers", () => {
    expect(() => splicePlatformTable("no markers here")).toThrow(/platform-table/);
  });

  test("names the page it renders into", () => {
    expect(USE_WITH_YOUR_AGENT).toBe("documentation/use-with-your-agent.md");
  });
});
