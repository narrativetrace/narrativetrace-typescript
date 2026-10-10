// SPDX-License-Identifier: BUSL-1.1
// Licensed under the Business Source License 1.1 (see LICENSE); Change Date: four years from publication; Change License: Apache-2.0
// Copyright (c) 2026 Empower Agile
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { SKILLS } from "@narrativetrace/skills-catalogue";
import { describe, expect, it } from "vitest";

/**
 * Every skill the catalogue ships is listed where a reader or an agent looks for the list: the
 * "Agent skills" section of llms.txt and every language's agent-skills page. Port of Java
 * `CatalogueDocsDriftTest` (Phase 7 milestone 2): those pages are hand-written, so before this
 * nothing failed when a skill shipped without them — the rendered SKILL.md pages have their own
 * drift check, the prose that introduces them had none.
 */

const ROOT = join(import.meta.dirname, "..");
const read = (path: string) => readFileSync(join(ROOT, path), "utf8");

/** The llms.txt section between `## Agent skills` and the next `## ` heading. */
function agentSkillsSection(llms: string): string {
  const start = llms.indexOf("## Agent skills");
  const end = llms.indexOf("\n## ", start + 1);
  return llms.slice(start, end < 0 ? undefined : end);
}

const PAGES = [
  "documentation/agent-skills.md",
  "documentation/es/habilidades-de-agente.md",
  "documentation/pt-BR/habilidades-de-agente.md",
  "documentation/zh-CN/智能体技能.md",
];

const names = SKILLS.map((skill) => skill.canonicalName);

describe("every catalogue skill is listed where the docs list skills", () => {
  it.each(names)("llms.txt's Agent skills section lists %s", (name) => {
    expect(agentSkillsSection(read("documentation/llms.txt"))).toContain(`\`${name}\``);
  });

  it.each(
    PAGES.flatMap((page) => names.map((name) => [page, name])),
  )("%s lists %s", (page, name) => {
    expect(read(page)).toContain(`\`${name}\``);
  });

  it("llms.txt's init sentence names every skill directory it installs", () => {
    const section = agentSkillsSection(read("documentation/llms.txt"));
    expect(section).toContain(`.agents/skills/{${names.join(",")}}/`);
  });
});
