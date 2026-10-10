// SPDX-License-Identifier: BUSL-1.1
// Licensed under the Business Source License 1.1 (see LICENSE); Change Date: four years from publication; Change License: Apache-2.0
// Copyright (c) 2026 Empower Agile
/**
 * Whether a page nobody stamped is nevertheless ours.
 *
 * INTENT: a project can get these skills from a registry before it ever runs `init` — a registry
 * installs THIS repository's own rendered pages, out of the public git tree, without a provenance
 * line. Such a page is not a foreign page at all; it is ours, unstamped. Recognising that is what
 * lets `init` adopt it instead of refusing it, and it is the one place the distinction is decided.
 *
 * @llmNote The comparison is the rendered bytes with ONLY the line ending normalised. A trailing
 * space, a reordered frontmatter key, a missing final newline, another release's wording, or the
 * other flavour's page is NOT adoptable — it is either somebody's edit or another release, and both
 * of those are exactly what the refusal exists to protect.
 *
 * @sideEffects None. A pure comparison of two strings.
 */

/** Both spellings of a line ending read as one, and nothing else about the page is touched. */
function withOneLineEnding(page: string): string {
  return page.replaceAll("\r\n", "\n").replaceAll("\r", "\n");
}

/**
 * Whether `installed` is the carrier's own `rendered` page for some flavour.
 *
 * An empty installed page is never adoptable: a skill directory with no page at all is a directory
 * somebody else made, not a copy of ours.
 *
 * @throws {TypeError} when either side is not a page — adoption compares two texts, and a missing
 * one would otherwise compare equal to another missing one.
 */
export function isAdoptable(installed: string, rendered: string): boolean {
  if (typeof installed !== "string" || typeof rendered !== "string") {
    throw new TypeError("adoption compares two pages, never null");
  }
  return installed !== "" && withOneLineEnding(installed) === withOneLineEnding(rendered);
}
