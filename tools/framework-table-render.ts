// SPDX-License-Identifier: BUSL-1.1
// Licensed under the Business Source License 1.1 (see LICENSE); Change Date: four years from publication; Change License: Apache-2.0
// Copyright (c) 2026 Empower Agile
import { readFileSync } from "node:fs";
import { FRAMEWORK_ROWS } from "../packages/tooling/src/frameworks/framework-table.js";
import {
  COVERED_FRAMEWORKS_BLOCK,
  FRAMEWORK_TABLE_BLOCK,
  llmsFullFrameworkSection,
  llmsTxtCoveredFrameworks,
  spliceBlock,
} from "../packages/tooling/src/frameworks/framework-table-docs.js";
import { stripLicenseHeader } from "./snippet-shared.js";

/** The snippet carrier bundled into `@narrativetrace/tooling`, repository-relative. */
export const SNIPPET_CARRIER = "packages/tooling/src/frameworks/wiring-snippets.json";
export const LLMS_FULL = "documentation/llms-full.md";
export const LLMS_TXT = "documentation/llms.txt";

/**
 * Every file the framework table renders into, with the text it must have: the snippet carrier
 * the doctor reads (each fixture's current text, license header stripped exactly as `snippet-check`
 * strips it), `llms-full.md`'s table block, and `llms.txt`'s covered-frameworks line.
 *
 * INTENT: one source, three surfaces (Phase 6 D1). Rendered from the fixtures' CURRENT text, never
 * from the carrier being checked, so a stale carrier cannot vouch for itself.
 */
export function expectedFrameworkTableFiles(
  read: (path: string) => string = (path) => readFileSync(path, "utf-8"),
): ReadonlyMap<string, string> {
  const snippets = fixtureTexts(read);
  const snippetOf = (fixture: string) => snippets[fixture] as string;
  const version = (JSON.parse(read("packages/core/package.json")) as { version: string }).version;
  const covered = `${llmsTxtCoveredFrameworks()}\n`;
  return new Map([
    [SNIPPET_CARRIER, `${JSON.stringify(snippets, null, 2)}\n`],
    [
      LLMS_FULL,
      spliceBlock(
        read(LLMS_FULL),
        FRAMEWORK_TABLE_BLOCK,
        llmsFullFrameworkSection(version, snippetOf),
      ),
    ],
    [LLMS_TXT, spliceBlock(read(LLMS_TXT), COVERED_FRAMEWORKS_BLOCK, covered)],
  ]);
}

/** Each distinct snippet fixture's text as a reader pastes it, in table order. */
function fixtureTexts(read: (path: string) => string): Record<string, string> {
  const texts: Record<string, string> = {};
  for (const row of FRAMEWORK_ROWS) {
    if (row.wiring.kind !== "snippet" || row.wiring.fixture in texts) continue;
    texts[row.wiring.fixture] =
      `${stripLicenseHeader(read(row.wiring.fixture)).replace(/\n+$/, "")}\n`;
  }
  return texts;
}
