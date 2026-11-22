// SPDX-License-Identifier: BUSL-1.1
// Licensed under the Business Source License 1.1 (see LICENSE); Change Date: four years from publication; Change License: Apache-2.0
// Copyright (c) 2026 Empower Agile
import type { Skill } from "../skill.js";
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
 * No `allowed-tools` line, ever. Anthropic's plugin directory accepts `allowed-tools` beyond the
 * read-only tools (Read, Grep, Glob, LS) only from Verified organizations, and this publisher is
 * not one (the portal's validation blocks a submission on exactly this line). So the page never
 * pre-approves a command: a user gets Claude Code's normal permission prompt the first time a skill
 * runs `pnpm`, `npx`, `node` or `git`.
 *
 * A skill's declared `allowedTools` stay in the model as the closed set of commands it runs, which
 * `allowedToolsViolations` and the lints that keep a publishing or promoting skill from ever
 * declaring its own command still read, and which the plugin README discloses. They are data about
 * the skill, not a rendering: nothing here turns them into frontmatter, and
 * `__tests__/claude-pages-no-allowed-tools.test.ts` fails if a committed page carries the key.
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
  lines.push("---");
  return lines.join("\n");
}
