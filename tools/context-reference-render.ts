// SPDX-License-Identifier: BUSL-1.1
// Licensed under the Business Source License 1.1 (see LICENSE); Change Date: four years from publication; Change License: Apache-2.0
// Copyright (c) 2026 Empower Agile
import { readFileSync } from "node:fs";
import { renderContextReferenceTable } from "./context-reference-table.js";

export const CONTEXT_REFERENCE_PAGE = "documentation/llms-full.md";
const MARKER_BEGIN = "<!-- context-reference:begin -->";
const MARKER_END = "<!-- context-reference:end -->";

/**
 * Replaces the text between `<!-- context-reference:begin -->` and
 * `<!-- context-reference:end -->` in `page` with `table`, leaving everything else untouched.
 *
 * @throws {Error} naming `page` when either marker is missing, or the end marker precedes the
 * begin marker — a page that lost its markers is a bug in the page, not a silent no-op.
 */
export function applyContextReferenceTable(page: string, table: string): string {
  const begin = page.indexOf(MARKER_BEGIN);
  const end = page.indexOf(MARKER_END);
  if (begin === -1 || end === -1 || end < begin) {
    throw new Error(
      `context-reference-render: ${MARKER_BEGIN} / ${MARKER_END} not found (in that order)`,
    );
  }
  const before = page.slice(0, begin + MARKER_BEGIN.length);
  const after = page.slice(end);
  return `${before}\n${table}\n${after}`;
}

/** {@link applyContextReferenceTable} over the real page and the real generated table. */
export function expectedContextReferencePage(pagePath: string = CONTEXT_REFERENCE_PAGE): string {
  return applyContextReferenceTable(readFileSync(pagePath, "utf-8"), renderContextReferenceTable());
}
