// SPDX-License-Identifier: BUSL-1.1
// Licensed under the Business Source License 1.1 (see LICENSE); Change Date: four years from publication; Change License: Apache-2.0
// Copyright (c) 2026 Empower Agile
import type { ReasonedRule, Skill, SkillStep, StepBody } from "../skill.js";

/**
 * The Markdown BODY every platform's `SKILL.md` shares (skill-design.md §4.1) — only the
 * frontmatter differs per platform (`render/claude.ts`'s plugin frontmatter vs
 * `render/agents-skills.ts`'s `name`/`description`-only subset). Extracted 2026-09-14 when a
 * second platform (Codex's `.agents/skills/` layout) needed the identical page body: duplicating
 * this function per renderer would have let the two pages drift on every future step-rendering
 * change.
 */
export function renderSkillBody(skill: Skill, resolveSnippet: (path: string) => string): string {
  const sections = [
    `# ${skill.canonicalName}`,
    "",
    skill.steps.map((step, i) => renderStep(step, i + 1, resolveSnippet)).join("\n\n"),
  ];
  if (skill.always.length > 0) sections.push("", renderRules("Always", skill.always));
  if (skill.never.length > 0) sections.push("", renderRules("Never", skill.never));
  return sections.join("\n");
}

function renderStepBody(body: StepBody, resolveSnippet: (path: string) => string): string {
  if (body.kind === "commands") {
    return ["```bash", ...body.commands, "```"].join("\n");
  }
  const maskAttr = body.mask ? ` mask=${body.mask}` : "";
  return [
    `<!-- snippet: ${body.path}${maskAttr} -->`,
    `\`\`\`${body.language}`,
    resolveSnippet(body.path),
    "```",
    "<!-- /snippet -->",
  ].join("\n");
}

function renderStep(
  step: SkillStep,
  index: number,
  resolveSnippet: (path: string) => string,
): string {
  const lines = [`## ${index}. ${step.title}`, ""];
  if (step.flag) lines.push(`**Flagged:** ${step.flag}`, "");
  lines.push(renderStepBody(step.body, resolveSnippet));
  if (step.verify) lines.push("", `**verify:** \`${step.verify}\``);
  for (const note of step.failure ?? []) {
    lines.push("", `**failure:** ${note.symptom} — ${note.cause}. Fix: ${note.fix}`);
  }
  return lines.join("\n");
}

function renderRules(heading: string, rules: readonly ReasonedRule[]): string {
  const items = rules.map((r) => `- ${r.rule} (${r.reason})`);
  return [`## ${heading}`, "", ...items].join("\n");
}
