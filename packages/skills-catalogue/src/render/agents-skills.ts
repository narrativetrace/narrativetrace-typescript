// SPDX-License-Identifier: BUSL-1.1
// Licensed under the Business Source License 1.1 (see LICENSE); Change Date: four years from publication; Change License: Apache-2.0
// Copyright (c) 2026 Empower Agile
import type { Skill } from "../skill.js";
import { renderSkillBody } from "./body.js";

/**
 * Renders `skill` for the `.agents/skills/<canonicalName>/SKILL.md` layout the Codex CLI
 * discovers on its own — walked from the working directory up to the repository root, plus
 * `~/.agents/skills` for user-global skills (developers.openai.com/codex/skills,
 * developers.openai.com/codex/concepts/customization; fetched 2026-09-13). Its documented
 * frontmatter is a strict subset of Claude's plugin frontmatter — `name` and `description` only,
 * no `when_to_use`, no `allowed-tools` — so the page BODY is rendered through the exact same
 * function `render/claude.ts` uses (`render/body.ts`) and only the frontmatter differs here.
 */
export function renderAgentsSkill(skill: Skill, resolveSnippet: (path: string) => string): string {
  return [renderFrontmatter(skill), "", renderSkillBody(skill, resolveSnippet)].join("\n");
}

function renderFrontmatter(skill: Skill): string {
  return [
    "---",
    `name: ${skill.canonicalName}`,
    `description: ${JSON.stringify(skill.description)}`,
    "---",
  ].join("\n");
}
