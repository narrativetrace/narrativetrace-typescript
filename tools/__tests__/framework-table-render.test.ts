// SPDX-License-Identifier: BUSL-1.1
// Licensed under the Business Source License 1.1 (see LICENSE); Change Date: four years from publication; Change License: Apache-2.0
// Copyright (c) 2026 Empower Agile
import { readFileSync } from "node:fs";
import { describe, expect, test } from "vitest";
import {
  expectedFrameworkTableFiles,
  LLMS_FULL,
  LLMS_TXT,
  SNIPPET_CARRIER,
} from "../framework-table-render.js";

const PAGES: Readonly<Record<string, string>> = {
  [LLMS_FULL]: "head\n<!-- framework-table:begin -->\nstale\n<!-- framework-table:end -->\ntail\n",
  [LLMS_TXT]: "head\n<!-- covered-frameworks:begin -->\nstale\n<!-- covered-frameworks:end -->\n",
  "packages/core/package.json": JSON.stringify({ version: "7.7.7" }),
};

const HEADER = "// SPDX-License-Identifier: BUSL-1.1\n\n";

/** Pages from the table above; every fixture as `<header>` + its own path + extra blank lines. */
function fakeRead(path: string): string {
  return PAGES[path] ?? `${HEADER}export const fixture = "${path}";\n\n\n`;
}

describe("expectedFrameworkTableFiles", () => {
  const files = expectedFrameworkTableFiles(fakeRead);

  test("renders exactly the three surfaces", () => {
    expect([...files.keys()]).toEqual([SNIPPET_CARRIER, LLMS_FULL, LLMS_TXT]);
  });

  test("carries each fixture's current text, publish header stripped, one trailing newline", () => {
    const carrier = JSON.parse(files.get(SNIPPET_CARRIER) as string) as Record<string, string>;
    const pino = "packages/pino/__tests__/wiring/narrative-pipeline.ts";
    expect(carrier[pino]).toBe(`export const fixture = "${pino}";\n`);
  });

  test("writes the carrier as two-space JSON with a final newline", () => {
    const text = files.get(SNIPPET_CARRIER) as string;
    expect(text.startsWith('{\n  "packages/')).toBe(true);
    expect(text.endsWith("}\n")).toBe(true);
  });

  test("renders the pages from the fixtures' current text and the repository's version", () => {
    const full = files.get(LLMS_FULL) as string;
    expect(full).not.toContain("stale");
    expect(full).toContain("@narrativetrace/express@7.7.7");
    expect(full).toContain(
      'export const fixture = "packages/express/__tests__/wiring/narrative-trace.ts";',
    );
    expect(full.startsWith("head\n")).toBe(true);
    expect(full.endsWith("<!-- framework-table:end -->\ntail\n")).toBe(true);
    expect(files.get(LLMS_TXT)).toContain(
      "Covered frameworks (each row of the doctor's framework table): ",
    );
  });

  test("the committed surfaces match what the table renders today", () => {
    const real = expectedFrameworkTableFiles();
    for (const [path, text] of real) expect(readFileSync(path, "utf-8"), path).toBe(text);
  });
});
