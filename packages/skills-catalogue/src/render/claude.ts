// SPDX-License-Identifier: BUSL-1.1
// Licensed under the Business Source License 1.1 (see LICENSE); Change Date: four years from publication; Change License: Apache-2.0
// Copyright (c) 2026 Empower Agile
import { claudeToolPattern, type Skill } from "../skill.js";
import { renderSkillBody } from "./body.js";

/**
 * Renders `skill` as a Claude plugin `SKILL.md` (frontmatter + body). Pure: `resolveSnippet` is
 * injected so this module never touches disk — `tools/render-skills.ts` supplies the real reader,
 * tests supply a fake one. A `snippet` step embeds the CURRENT content of its source file through
 * the same `<!-- snippet: path -->` marker `snippet-check` already enforces for docs
 * (agent-skills-2026-09-12.md §3) — once the generated file is registered with that tool, drift
 * between this page and the fixture fails the gate the same way a stale doc page would. The body
 * is shared with every other platform's SKILL.md (`render/body.ts`) — only this frontmatter is
 * Claude-specific.
 *
 * `allowed-tools` carries TOOL PATTERNS ({@link claudeToolPattern}), never bare command names: the
 * field lists tools, and a permission rule is spelled `Tool` or `Tool(specifier)`, so a bare `git`
 * there names a tool that does not exist and pre-approves nothing at all. Pinned by
 * `allowedToolsViolations` in `../lints.js` — the catalogue declares commands, this renderer spells
 * them, and neither side may quietly become the other.
 */
export function renderClaudeSkill(skill: Skill, resolveSnippet: (path: string) => string): string {
  return [renderFrontmatter(skill), "", renderSkillBody(skill, resolveSnippet)].join("\n");
}

function renderFrontmatter(skill: Skill): string {
  const lines = [
    "---",
    `name: ${skill.canonicalName}`,
    `description: ${JSON.stringify(skill.description)}`,
  ];
  if (skill.whenToUse) lines.push(`when_to_use: ${JSON.stringify(skill.whenToUse)}`);
  // The LINE is omitted, never emitted empty: a skill that declares no tool pre-approves nothing,
  // and that absence is a safety property (see `publishingNotPreApproved`).
  if (skill.allowedTools.length > 0) {
    lines.push(`allowed-tools: ${skill.allowedTools.map(claudeToolPattern).join(", ")}`);
  }
  lines.push("---");
  return lines.join("\n");
}
