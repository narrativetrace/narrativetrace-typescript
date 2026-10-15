// SPDX-License-Identifier: BUSL-1.1
// Licensed under the Business Source License 1.1 (see LICENSE); Change Date: four years from publication; Change License: Apache-2.0
// Copyright (c) 2026 Empower Agile
import { MANUAL_LANE, type PlatformRow, platformRow } from "./platform-row.js";

/**
 * The platform table — Phase 8's D1: ONE committed registry of the agent platforms NarrativeTrace is
 * used from, how a project proves it is on one, which pointer `init` writes for it, how a stranger
 * installs the skills, and which evidence lane exercises it.
 *
 * INTENT: the framework table's sibling, same shape. `init`'s plan, `uninstall`, the doctor's
 * `config.skills-installed`, the Cursor plugin manifest and `documentation/use-with-your-agent.md`
 * all read these rows, and none of them is typed twice.
 *
 * @llmNote Every platform here already discovers the pages `init` writes under `.agents/skills` (and
 * `.claude/skills`); a row never adds a third page flavour. Row ids are a cross-port contract —
 * append, never rename. The platform facts carry their verification date because a docs-as-tests
 * check cannot reach the vendors: re-verify them at each release and move the date.
 */

/** The date every fact below was last checked against the vendors' own documentation. */
const VERIFIED = "2026-10-10";

const INIT = "run `narrativetrace init` in the project";

/** The Cursor rule's one sentence: where the skills are, and how to check the install. */
export const CURSOR_RULE_TEXT =
  "The NarrativeTrace skills live under `.agents/skills` — read them before changing traced code," +
  " and run the NarrativeTrace doctor to check the install.";

const CURSOR = platformRow({
  id: "cursor",
  name: "Cursor",
  markerPaths: [".cursor"],
  pointer: { kind: "rule", path: ".cursor/rules/narrativetrace.mdc", text: CURSOR_RULE_TEXT },
  installPath: `Install the plugin from the public repository's \`.cursor-plugin\` manifest, or ${INIT}`,
  agentFinds:
    "the skills in `.agents/skills` (Cursor also reads `.claude/skills`), and the one rule" +
    " `.cursor/rules/narrativetrace.mdc` that points at them",
  evidenceLane: "cursor",
  verified: VERIFIED,
});

const REPLIT = platformRow({
  id: "replit",
  name: "Replit",
  markerPaths: ["replit.md", ".replit"],
  pointer: { kind: "managed-section", path: "replit.md" },
  installPath:
    "Import the public repository from GitHub (paste its URL, preview the skills, add them)," +
    ` or ${INIT}`,
  agentFinds:
    "the skills in `.agents/skills`, and a NarrativeTrace section in `replit.md`, the project" +
    " memory the Replit agent reads first",
  evidenceLane: MANUAL_LANE,
  verified: VERIFIED,
});

/**
 * Antigravity (Google's agentic IDE and its `agy` CLI). Its markers are its OWN project layout —
 * `.agents/rules`, `.agents/workflows`, legacy `.agent/` — never `.agents/skills`, which `init`
 * itself writes. No registry install path: `agy plugin install` reads only a plugin's top-level
 * `skills/` directory, which this repository does not ship.
 */
const ANTIGRAVITY = platformRow({
  id: "antigravity",
  name: "Antigravity",
  markerPaths: [".agents/rules", ".agents/workflows", ".agent"],
  pointer: { kind: "none", path: "" },
  installPath: `Nothing to install beyond the project itself: ${INIT} and commit the skills (the \`agy\` CLI and the IDE read them as workspace skills)`,
  agentFinds:
    "the skills in `.agents/skills`, which Antigravity reads as workspace skills, and the section" +
    " in `AGENTS.md`, which it loads as rules",
  evidenceLane: "antigravity",
  verified: VERIFIED,
});

const GITHUB_COPILOT = platformRow({
  id: "github-copilot",
  name: "GitHub Copilot",
  markerPaths: [".github/copilot-instructions.md"],
  pointer: { kind: "none", path: "" },
  installPath: `Nothing to install beyond the repository itself: ${INIT} and commit the skills`,
  agentFinds:
    "the skills in `.agents/skills` (Copilot also reads `.claude/skills` and `.github/skills`)," +
    " and the section in `AGENTS.md`",
  evidenceLane: MANUAL_LANE,
  verified: VERIFIED,
});

const CLAUDE_CODE = platformRow({
  id: "claude-code",
  name: "Claude Code",
  markerPaths: [".claude"],
  pointer: { kind: "none", path: "" },
  installPath: `Add the repository as a plugin marketplace and install its plugin, or ${INIT}`,
  agentFinds:
    "the skills in `.claude/skills` and `.agents/skills`, and the section in `AGENTS.md` that" +
    " `CLAUDE.md` imports",
  evidenceLane: "claude",
  verified: VERIFIED,
});

/** The rows, in their published order. */
export const PLATFORM_ROWS: readonly PlatformRow[] = Object.freeze([
  CURSOR,
  REPLIT,
  ANTIGRAVITY,
  GITHUB_COPILOT,
  CLAUDE_CODE,
]);

/** The row with this id, or `undefined` — ids match whole, so `cursorx` is no `cursor`. */
export function platformRowById(id: string): PlatformRow | undefined {
  return PLATFORM_ROWS.find((row) => row.id === id);
}
