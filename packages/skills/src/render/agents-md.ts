// SPDX-License-Identifier: BUSL-1.1
// Licensed under the Business Source License 1.1 (see LICENSE); Change Date: four years from publication; Change License: Apache-2.0
// Copyright (c) 2026 Empower Agile
import type { ProListing } from "../pro-listing.js";
import type { Skill } from "../skill.js";

export const AGENTS_MD_BEGIN = "<!-- narrativetrace:skills:start -->";
export const AGENTS_MD_END = "<!-- narrativetrace:skills:end -->";

/**
 * The always-on AGENTS.md snippet (skill-design.md §2.1 Channel 3 — "the Vercel 100% lever"): a
 * compressed catalogue index plus the llms.txt pointer, so an agent that never thinks to look for
 * a skill still sees one line naming it. Delimited so an installer (or this repo's own render
 * step) can replace the section without touching anything else in the file.
 */
export function renderAgentsMdSnippet(
  skills: readonly Skill[],
  listings: readonly ProListing[],
): string {
  const lines = [AGENTS_MD_BEGIN, "## NarrativeTrace agent skills", ""];
  for (const skill of skills) lines.push(`- \`${skill.canonicalName}\` — ${skill.description}`);
  for (const listing of listings) {
    lines.push(`- \`${listing.canonicalName}\` (Pro, ${listing.status}) — ${listing.delivers}`);
  }
  lines.push("", "See llms.txt for the full doc index.", AGENTS_MD_END);
  return lines.join("\n");
}

/** Replaces the delimited section in `content`, or appends it if the markers are not present yet. */
export function spliceAgentsMdSection(content: string, section: string): string {
  const begin = content.indexOf(AGENTS_MD_BEGIN);
  const end = content.indexOf(AGENTS_MD_END);
  if (begin === -1 || end === -1) return `${content.trimEnd()}\n\n${section}\n`;
  return content.slice(0, begin) + section + content.slice(end + AGENTS_MD_END.length);
}

/**
 * The delimited section of `content`, markers included, or `undefined` when either marker is
 * missing. The read-side inverse of {@link spliceAgentsMdSection}'s write: this repository's own
 * `AGENTS.md` is a private agent-orientation briefing that never ships, but the publish pipeline
 * still ships this one section — the same committed build output as a rendered `SKILL.md` under
 * `.claude/skills/` (documentation/what-to-commit.md) — composed into a fresh public `AGENTS.md`
 * on its own.
 */
export function extractAgentsMdSection(content: string): string | undefined {
  const begin = content.indexOf(AGENTS_MD_BEGIN);
  const end = content.indexOf(AGENTS_MD_END);
  if (begin === -1 || end === -1) return undefined;
  return content.slice(begin, end + AGENTS_MD_END.length);
}
