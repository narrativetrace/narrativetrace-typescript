// SPDX-License-Identifier: BUSL-1.1
// Licensed under the Business Source License 1.1 (see LICENSE); Change Date: four years from publication; Change License: Apache-2.0
// Copyright (c) 2026 Empower Agile
import { hasExactlyOneRegion, MARKER_END, MARKER_START, scanMarkedBlocks } from "./marked-block.js";

/**
 * Renders the one Cursor rule file — `.cursor/rules/narrativetrace.mdc` — that points Cursor's agent
 * at the installed skills.
 *
 * INTENT: the Cursor row's pointer. The rule is a SENTENCE, never a copy of a skill page: Cursor
 * already loads the pages from `.agents/skills`, and a second copy would be a third page flavour to
 * keep in step. The same text is the plugin's rule, so a project that installed the plugin and one
 * that ran `init` read the same words.
 *
 * @llmNote The file is frontmatter plus one managed section: Cursor needs the `---` block first, so
 * the `narrativetrace:created` note a markdown home carries cannot go on line 1.
 * {@link CURSOR_FRONTMATTER} is therefore also what an uninstall compares against — a rule file that
 * is nothing but the frontmatter once our section is removed is a file we made, and is deleted. With
 * an empty coordinate the opening marker carries no stamp, which is how the plugin ships it and why
 * `init` can adopt it.
 *
 * @llmNote Renders with `\n` throughout.
 *
 * @sideEffects None.
 */

/** The `.mdc` frontmatter: always applied, because the pointer must be seen every turn. */
export const CURSOR_FRONTMATTER =
  "---\ndescription: Where the NarrativeTrace agent skills live in this project\n" +
  "alwaysApply: true\n---\n";

/**
 * The whole rule file for one pointer sentence.
 *
 * @param text the pointer sentence, from the platform table's Cursor row
 * @param coordinate the carrier coordinate stamped on the opening marker, or `""` for the unstamped
 * plugin copy
 * @throws {TypeError} when the text is blank or the coordinate is absent.
 */
export function renderCursorRule(text: string, coordinate: string): string {
  if (typeof text !== "string" || text.trim() === "" || typeof coordinate !== "string") {
    throw new TypeError('a rule needs its text and a coordinate (or "")');
  }
  const stamp = coordinate === "" ? "" : ` ${coordinate}`;
  const rule = `${CURSOR_FRONTMATTER}${MARKER_START}${stamp} -->\n${text}\n${MARKER_END}\n`;
  if (!hasExactlyOneRegion(scanMarkedBlocks(rule))) {
    throw new TypeError("the rendered rule must be exactly one managed region");
  }
  return rule;
}
