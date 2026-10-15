// SPDX-License-Identifier: BUSL-1.1
// Licensed under the Business Source License 1.1 (see LICENSE); Change Date: four years from publication; Change License: Apache-2.0
// Copyright (c) 2026 Empower Agile
import { spliceBlock } from "../frameworks/framework-table-docs.js";
import type { PlatformRow } from "./platform-row.js";
import { MANUAL_LANE } from "./platform-row.js";
import { PLATFORM_ROWS } from "./platform-table.js";

/**
 * The platform table, rendered for readers: the table at the top of
 * `documentation/use-with-your-agent.md`.
 *
 * INTENT: the page's one claim that changes with the vendors — how a stranger gets the skills on
 * each platform and what the agent finds — is a view of {@link PLATFORM_ROWS}, never typed. The block
 * sits between `<!-- platform-table:begin -->` / `<!-- platform-table:end -->`; `pnpm run
 * platform-table-render` rewrites it and `platform-table-check` fails the gate while the page
 * disagrees. The Verified column is the honesty: no test reaches the vendors, so each row carries
 * the date its facts were last checked.
 *
 * @llmNote A cell never carries an unescaped pipe or a newline: the translations of the page mirror
 * the table's shape, and a stray pipe would add a column to the English page only.
 */

/** The page this table is rendered into, repository-relative. */
export const USE_WITH_YOUR_AGENT = "documentation/use-with-your-agent.md";

/** The block name of the platform table in {@link USE_WITH_YOUR_AGENT}. */
export const PLATFORM_TABLE_BLOCK = "platform-table";

const HEADER =
  "| Platform | How a stranger gets the skills | What the agent finds after `init` |" +
  " Evidence | Verified |\n|---|---|---|---|---|\n";

function cell(text: string): string {
  return text.replaceAll("|", "\\|").replaceAll("\n", " ");
}

function evidence(row: PlatformRow): string {
  return row.evidenceLane === MANUAL_LANE ? "manual trial" : `Tier B lane \`${row.evidenceLane}\``;
}

function line(row: PlatformRow): string {
  const cells = [row.name, row.installPath, row.agentFinds, evidence(row), row.verified];
  return `| ${cells.map(cell).join(" | ")} |\n`;
}

/** The Markdown table: a header, a separator, and one line per platform in table order. */
export function platformTableMarkdown(rows: readonly PlatformRow[] = PLATFORM_ROWS): string {
  return HEADER + rows.map(line).join("");
}

/**
 * The page with its table block re-rendered.
 *
 * @throws {Error} when the page lacks the `platform-table` marker pair, in that order.
 */
export function splicePlatformTable(page: string): string {
  return spliceBlock(page, PLATFORM_TABLE_BLOCK, platformTableMarkdown());
}
