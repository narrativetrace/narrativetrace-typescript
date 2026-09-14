// SPDX-License-Identifier: BUSL-1.1
// Licensed under the Business Source License 1.1 (see LICENSE); Change Date: four years from publication; Change License: Apache-2.0
// Copyright (c) 2026 Empower Agile
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import {
  PRO_LISTINGS,
  renderAgentsMdSnippet,
  renderAgentsSkill,
  renderClaudeSkill,
  SKILLS,
  spliceAgentsMdSection,
} from "@narrativetrace/skills";
import { stripLicenseHeader } from "./snippet-shared.js";

// Per-commit gate (wired into `pnpm run check`, after `pnpm run build` so @narrativetrace/skills'
// dist exists): SKILL.md and the AGENTS.md managed section are BUILD OUTPUT of the typed catalogue
// (skill-design.md §4.1) — never hand-edited. Mirrors tools/license-header.ts's --check/--fix pair:
// --check fails naming what drifted (run `pnpm run skills-render` to fix it); --fix writes it.

// `stripLicenseHeader` is documentation/'s own `<!-- snippet: -->` mechanism's fix for the same
// gap this had until 2026-09-13: `add-narrative-tracing`'s steps embed real source
// (examples/sixty-seconds/*.js) verbatim, and the publish pipeline's header stamp adds a BSL
// preface to every staged source file — in-tree sources never carry it, so a published snapshot's
// stamped example no longer matches this repo's own committed SKILL.md without this strip.
function resolveSnippet(path: string): string {
  return stripLicenseHeader(readFileSync(path, "utf-8")).replace(/\n$/, "");
}

/**
 * Both platforms' SKILL.md render into the same directory shape (`<root>/<canonicalName>/SKILL.md`)
 * — `.claude/skills/` for Claude's plugin layout, `.agents/skills/` for Codex's own discovered
 * layout (README.md: "Why `.agents/skills/` and not `.codex/skills/`"). Adding a third platform
 * means one more entry in this list, never a new file-writing function.
 */
const PLATFORM_RENDERERS = [
  { root: ".claude/skills", render: renderClaudeSkill },
  { root: ".agents/skills", render: renderAgentsSkill },
] as const;

function renderedSkillFiles(): ReadonlyMap<string, string> {
  const files = new Map<string, string>();
  for (const skill of SKILLS) {
    for (const { root, render } of PLATFORM_RENDERERS) {
      files.set(`${root}/${skill.canonicalName}/SKILL.md`, `${render(skill, resolveSnippet)}\n`);
    }
  }
  return files;
}

function renderedAgentsMd(): string {
  const current = existsSync("AGENTS.md") ? readFileSync("AGENTS.md", "utf-8") : "";
  return spliceAgentsMdSection(current, renderAgentsMdSnippet(SKILLS, PRO_LISTINGS));
}

function checkAll(): string[] {
  const drifted: string[] = [];
  for (const [path, expected] of renderedSkillFiles()) {
    const actual = existsSync(path) ? readFileSync(path, "utf-8") : undefined;
    if (actual !== expected) drifted.push(path);
  }
  const expectedAgentsMd = renderedAgentsMd();
  if (readFileSync("AGENTS.md", "utf-8") !== expectedAgentsMd) drifted.push("AGENTS.md");
  return drifted;
}

function fixAll(): string[] {
  const written: string[] = [];
  for (const [path, content] of renderedSkillFiles()) {
    mkdirSync(path.slice(0, path.lastIndexOf("/")), { recursive: true });
    writeFileSync(path, content);
    written.push(path);
  }
  writeFileSync("AGENTS.md", renderedAgentsMd());
  written.push("AGENTS.md");
  return written;
}

const mode = process.argv[2];
if (mode !== "--check" && mode !== "--fix") {
  console.error("Usage: tsx tools/skills-render.ts --check|--fix");
  process.exit(1);
}

if (mode === "--check") {
  const drifted = checkAll();
  if (drifted.length > 0) {
    console.error(
      `${drifted.length} skill artifact(s) do not match the typed catalogue: ${drifted.join(", ")}\n` +
        "Run `pnpm run skills-render` to regenerate them.",
    );
    process.exit(1);
  }
  console.log("skills-render: SKILL.md and AGENTS.md match the typed catalogue");
} else {
  for (const path of fixAll()) console.log(`wrote ${path}`);
}
