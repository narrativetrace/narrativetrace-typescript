// SPDX-License-Identifier: BUSL-1.1
// Licensed under the Business Source License 1.1 (see LICENSE); Change Date: four years from publication; Change License: Apache-2.0
// Copyright (c) 2026 Empower Agile
import { describe, expect, test } from "vitest";
import { wiringFoundIn } from "../../src/frameworks/framework-detection.js";
import { FRAMEWORK_ROWS } from "../../src/frameworks/framework-table.js";
import { wiringSnippet } from "../../src/frameworks/wiring-snippets.js";

const snippetRows = FRAMEWORK_ROWS.flatMap((row) =>
  row.wiring.kind === "snippet" ? [{ id: row.id, wiring: row.wiring }] : [],
);

const lineCommented = (text: string): string =>
  text
    .split("\n")
    .map((line) => `// ${line}`)
    .join("\n");

const blockCommented = (text: string): string => `/*\n${text}\n*/`;

describe("a comment naming the wiring is not the wiring, for every snippet row", () => {
  test.each(snippetRows)("$id: its own snippet is wiring in code", ({ wiring }) => {
    expect(wiringFoundIn(wiring, [wiringSnippet(wiring.fixture)])).toBe(true);
  });

  test.each(snippetRows)("$id: its snippet as line comments is not wiring", ({ wiring }) => {
    const commented = lineCommented(wiringSnippet(wiring.fixture));
    expect(wiringFoundIn(wiring, [commented])).toBe(false);
  });

  test.each(snippetRows)("$id: its snippet in a block comment is not wiring", ({ wiring }) => {
    const commented = blockCommented(wiringSnippet(wiring.fixture));
    expect(wiringFoundIn(wiring, [commented])).toBe(false);
  });
});
