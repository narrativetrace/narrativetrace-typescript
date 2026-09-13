// SPDX-License-Identifier: BUSL-1.1
// Licensed under the Business Source License 1.1 (see LICENSE); Change Date: four years from publication; Change License: Apache-2.0
// Copyright (c) 2026 Empower Agile
import type { ReasonedRule, Skill, SkillStep, StepBody } from "../skill.js";

/**
 * Renders `skill` as a Claude plugin `SKILL.md` (frontmatter + body). Pure: `resolveSnippet` is
 * injected so this module never touches disk — `tools/render-skills.ts` supplies the real reader,
 * tests supply a fake one. A `snippet` step embeds the CURRENT content of its source file through
 * the same `<!-- snippet: path -->` marker `snippet-check` already enforces for docs
 * (agent-skills-2026-09-12.md §3) — once the generated file is registered with that tool, drift
 * between this page and the fixture fails the gate the same way a stale doc page would.
 */
export function renderClaudeSkill(skill: Skill, resolveSnippet: (path: string) => string): string {
  return [renderFrontmatter(skill), "", renderBody(skill, resolveSnippet)].join("\n");
}

function renderFrontmatter(skill: Skill): string {
  const lines = [
    "---",
    `name: ${skill.claudeSegment}`,
    `description: ${JSON.stringify(skill.description)}`,
  ];
  if (skill.whenToUse) lines.push(`when_to_use: ${JSON.stringify(skill.whenToUse)}`);
  lines.push(`allowed-tools: ${skill.allowedTools.join(", ")}`, "---");
  return lines.join("\n");
}

function renderBody(skill: Skill, resolveSnippet: (path: string) => string): string {
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
