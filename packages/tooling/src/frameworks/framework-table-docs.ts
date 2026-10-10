// SPDX-License-Identifier: BUSL-1.1
// Licensed under the Business Source License 1.1 (see LICENSE); Change Date: four years from publication; Change License: Apache-2.0
// Copyright (c) 2026 Empower Agile
import { installLine } from "./framework-detection.js";
import type { CheckBinding, FrameworkRow } from "./framework-row.js";
import { FRAMEWORK_ROWS } from "./framework-table.js";
import { wiringSnippet } from "./wiring-snippets.js";

/**
 * The framework table, rendered for readers: the block in `llms-full.md` and the covered-frameworks
 * line in `llms.txt`.
 *
 * INTENT: the doctor, the docs and the skill all answer "which frameworks, which packages, which
 * lines" — so all three read {@link FRAMEWORK_ROWS}, and none is typed. Each rendered block sits
 * between `<!-- <name>:begin -->` / `<!-- <name>:end -->` markers; `pnpm run
 * framework-table-render` rewrites them and `framework-table-check` fails the gate while they
 * disagree. The wiring blocks carry the same `<!-- snippet: -->` markers the rest of the docs use,
 * so `snippet-check` holds the page to the compiled fixtures as well, and `snippet-sync` keeps the
 * pinned install coordinates on the repository's version.
 */

/** The block name of the framework table in `llms-full.md`. */
export const FRAMEWORK_TABLE_BLOCK = "framework-table";

/** The block name of the covered-frameworks line in `llms.txt`. */
export const COVERED_FRAMEWORKS_BLOCK = "covered-frameworks";

const INTRO =
  "Rendered from the doctor's own framework table, which ships inside `@narrativetrace/tooling`. " +
  "For every row it can observe, `narrativetrace doctor` runs the named check: the framework is " +
  "detected but its integration is not installed, or installed but never wired — and the failing " +
  "fix prints the install line (with the project's own package manager and NarrativeTrace " +
  "version) and the wiring below. A framework with no integration shipped is reported as such, " +
  "so an agent leaves it alone rather than guessing one.";

/**
 * The framework table and every distinct wiring snippet, for `llms-full.md`.
 *
 * @param snippetOf the wiring lines of a fixture — the carried copy by default; the render tool
 *   passes the fixtures' CURRENT text, so a page and the carrier are rewritten from one source
 */
export function llmsFullFrameworkSection(
  version: string,
  snippetOf: (fixture: string) => string = wiringSnippet,
): string {
  const rows = FRAMEWORK_ROWS.map((row) => tableRow(row, version)).join("");
  const snippets = snippetRows()
    .map((row) => snippetSection(row, snippetOf))
    .join("");
  return (
    "### Framework table — what the doctor checks\n\n" +
    `${INTRO}\n\n` +
    "| Framework | Detected by | Install (npm) | Wiring | Doctor check |\n" +
    "|---|---|---|---|---|\n" +
    rows +
    snippets
  );
}

/** One line naming every row and the check that observes it, in table order, for `llms.txt`. */
export function llmsTxtCoveredFrameworks(): string {
  const covered = FRAMEWORK_ROWS.map((row) => `${row.name} (${coverage(row.check)})`).join("; ");
  return `Covered frameworks (each row of the doctor's framework table): ${covered}.`;
}

/**
 * `document` with everything between the `name` markers replaced by `content`.
 *
 * @throws {Error} when the document lacks either marker or has them out of order — a page that
 * lost its markers is a bug in the page, never a silent no-op
 */
export function spliceBlock(document: string, name: string, content: string): string {
  const begin = `<!-- ${name}:begin -->\n`;
  const end = `<!-- ${name}:end -->`;
  const from = document.indexOf(begin);
  const to = document.indexOf(end);
  if (from < 0 || to < from + begin.length) {
    throw new Error(`the document has no ${name}:begin / ${name}:end marker pair, in that order`);
  }
  return document.slice(0, from + begin.length) + content + document.slice(to);
}

function tableRow(row: FrameworkRow, version: string): string {
  const install = row.module === null ? "—" : `\`${installLine("npm", row.module, version)}\``;
  const cells = [row.name, row.marker.description, install, row.wiring.description];
  return `| ${[...cells, checkCell(row.check)].join(" | ")} |\n`;
}

function checkCell(check: CheckBinding): string {
  if (check.kind === "existing-check") return `\`${check.id}\` (existing)`;
  if (check.kind === "no-integration") return `\`${check.id}\` (reports it)`;
  return `\`${check.id}\``;
}

function coverage(check: CheckBinding): string {
  if (check.kind === "no-integration") return `no integration shipped, \`${check.id}\` reports it`;
  return `\`${check.id}\``;
}

/** The first row of each distinct snippet fixture, in table order. */
function snippetRows(): readonly FrameworkRow[] {
  const seen = new Set<string>();
  return FRAMEWORK_ROWS.filter((row) => {
    if (row.wiring.kind !== "snippet" || seen.has(row.wiring.fixture)) return false;
    seen.add(row.wiring.fixture);
    return true;
  });
}

function snippetSection(row: FrameworkRow, snippetOf: (fixture: string) => string): string {
  if (row.wiring.kind !== "snippet") return "";
  const { fixture, language } = row.wiring;
  return (
    `\n#### ${row.name} — wiring\n\n` +
    `<!-- snippet: ${fixture} -->\n` +
    `\`\`\`${language}\n${snippetOf(fixture)}\`\`\`\n` +
    "<!-- /snippet -->\n"
  );
}
