// SPDX-License-Identifier: BUSL-1.1
// Licensed under the Business Source License 1.1 (see LICENSE); Change Date: four years from publication; Change License: Apache-2.0
// Copyright (c) 2026 Empower Agile
import { eolOf, splitKeepingTerminators } from "./marked-block.js";

/**
 * The one line that says a copied `SKILL.md` is ours and which carrier it came from.
 *
 * INTENT: the installer must be able to tell a page it wrote from a page somebody else wrote, years
 * later and with no other state. That is what makes an upgrade safe (overwrite ours), a foreign
 * directory safe (refuse), and an uninstall safe (delete only ours).
 *
 * @llmNote The line goes AFTER the YAML frontmatter, never before it: a comment above the opening
 * `---` stops the frontmatter from parsing, and every skill runtime reads that frontmatter first.
 *
 * @llmNote Matching is anchored at column 0, the same rule the managed block's markers follow, so a
 * page that quotes the line in an example is not mistaken for an installed page.
 */

/** Everything before the coordinate. */
export const PROVENANCE_PREFIX = "<!-- installed by narrativetrace init from ";

/** Everything after the coordinate. */
export const PROVENANCE_SUFFIX = " — edit the catalogue, not this file -->";

const FRONTMATTER_FENCE = "---";

/** The provenance line for one carrier coordinate. */
export function provenanceLine(coordinate: string): string {
  return PROVENANCE_PREFIX + coordinate + PROVENANCE_SUFFIX;
}

/** A line without its terminator. */
function bareLine(line: string): string {
  const withoutNewline = line.endsWith("\n") ? line.slice(0, -1) : line;
  return withoutNewline.endsWith("\r") ? withoutNewline.slice(0, -1) : withoutNewline;
}

/**
 * A whole line, not a fragment: the length guard matters because {@link PROVENANCE_PREFIX} ends with
 * a space and {@link PROVENANCE_SUFFIX} starts with one, so the two can OVERLAP in a hand-edited
 * line.
 */
function isProvenance(line: string): boolean {
  return (
    line.length >= PROVENANCE_PREFIX.length + PROVENANCE_SUFFIX.length &&
    line.startsWith(PROVENANCE_PREFIX) &&
    line.endsWith(PROVENANCE_SUFFIX)
  );
}

/** The coordinate one line carries, or `undefined` when the line is not a provenance line. */
function coordinateOf(line: string): string | undefined {
  if (!isProvenance(line)) return undefined;
  const coordinate = line.slice(PROVENANCE_PREFIX.length, -PROVENANCE_SUFFIX.length).trim();
  return coordinate === "" ? undefined : coordinate;
}

/** The coordinate a page was installed from, or `undefined` when the page is not ours. */
export function coordinateIn(page: string): string | undefined {
  for (const raw of splitKeepingTerminators(page)) {
    const coordinate = coordinateOf(bareLine(raw));
    if (coordinate !== undefined) return coordinate;
  }
  return undefined;
}

/** The 1-based line number of the frontmatter's closing fence, or 0 when there is none. */
function frontmatterEnd(page: string): number {
  const lines = splitKeepingTerminators(page);
  if (lines.length === 0 || bareLine(lines[0] as string) !== FRONTMATTER_FENCE) return 0;
  for (let i = 1; i < lines.length; i++) {
    if (bareLine(lines[i] as string) === FRONTMATTER_FENCE) return i + 1;
  }
  return 0;
}

/**
 * The page with exactly one provenance line for `coordinate`, placed after the frontmatter —
 * replacing any line a previous install left, so stamping twice is stamping once.
 */
export function stampProvenance(page: string, coordinate: string): string {
  const eol = eolOf(page);
  const insertAfter = frontmatterEnd(page);
  let out = "";
  let number = 0;
  for (const raw of splitKeepingTerminators(page)) {
    number++;
    if (!isProvenance(bareLine(raw))) out += raw;
    if (number === insertAfter) out += provenanceLine(coordinate) + eol;
  }
  return insertAfter === 0 ? `${provenanceLine(coordinate)}${eol}${eol}${out}` : out;
}
