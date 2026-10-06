// SPDX-License-Identifier: BUSL-1.1
// Licensed under the Business Source License 1.1 (see LICENSE); Change Date: four years from publication; Change License: Apache-2.0
// Copyright (c) 2026 Empower Agile
import type { Carrier } from "./carrier.js";
import { hasExactlyOneRegion, MARKER_END, MARKER_START, scanMarkedBlocks } from "./marked-block.js";
import type { ProjectState } from "./project-state.js";

/**
 * Renders the managed section the installer writes into a consumer's `AGENTS.md`.
 *
 * INTENT: the always-on pointer. An agent that never saw an install prompt reads this section at the
 * start of its next session, finds the skills by name, and knows which command diagnoses the project —
 * the discovery channel that costs no description budget and needs no tool.
 *
 * What goes in, in this order: one line on what NarrativeTrace is here and where traces land, the
 * skills with the catalogue's own descriptions, the commands, the documentation pointer, and the three
 * rules the evaluations keep tripping over.
 *
 * @llmNote Nothing project-specific goes in beyond what the snapshot DETECTED — the output directory.
 * No inference, no generated coding rules, and no version talk: the coordinate on the opening marker is
 * a machine-written stamp, and it is the only version this block ever carries.
 *
 * @llmNote The commands carry `npx --yes`, not a bare `npx`. Without it, npm stops to ask "Ok to
 * proceed?" the first time a project without the CLI as a dev dependency runs one — a terminal stall
 * for exactly the unattended agent this section is written for (found in the owner's 2026-09-26 trial
 * of the published prompt). A project that DOES have the CLI locally resolves it and never asks, so the
 * flag costs that reader nothing.
 *
 * @llmNote Renders with `\n` throughout. A caller writing into a file that uses another line ending
 * converts with `withEol`.
 */

/** The runtime's documentation index, the one link an agent needs from here. */
export const DOCS_URL = "https://narrativetrace.ai/typescript/llms.txt";

/** How this runtime's CLI is invoked, non-interactively, in a project that does not have it locally. */
const CLI = "npx --yes @narrativetrace/cli";

function introduction(state: ProjectState): string {
  return [
    "## NarrativeTrace",
    "",
    "NarrativeTrace turns this project's own method names, parameters and return values into a" +
      " readable execution narrative — no log statements. Rendered traces land in" +
      ` \`${state.outputDirectory}\`.`,
    "",
  ].join("\n");
}

function skills(carrier: Carrier): string {
  return [
    "### Agent skills installed in this project",
    "",
    ...carrier.catalogue.skills.map((skill) => `- \`${skill.name}\` — ${skill.description}`),
    "",
  ].join("\n");
}

function commands(): string {
  return [
    "### Commands",
    "",
    `- \`${CLI} doctor\` — diagnose this install; read-only, and every finding names the skill that` +
      " fixes it",
    `- \`${CLI} init --dry-run\` — show what re-installing the skills would change, as a diff`,
    `- \`${CLI} uninstall\` — remove exactly what the installer wrote, this section included`,
    "",
    `Documentation: ${DOCS_URL}`,
    "",
  ].join("\n");
}

function rules(): string {
  return [
    "### Rules",
    "",
    "- Pass parameter names to `traceObject` explicitly. Without them the trace reads `arg0`," +
      " `arg1`, and the narrative is gone.",
    "- Never disable redaction to make a trace easier to read.",
    "- Commit `.approved.nt` files; never commit a `.received.nt`.",
    "",
  ].join("\n");
}

/**
 * The whole section, opening marker through closing marker, ending with a newline.
 *
 * @throws {TypeError} when either input is absent — a section with no carrier would carry no stamp,
 * and one with no project state would name a directory it never detected.
 */
export function renderAgentsMdBlock(carrier: Carrier, state: ProjectState): string {
  if (carrier == null || state == null) {
    throw new TypeError("a carrier and a project state are needed to render the section");
  }
  const block = [
    `${MARKER_START} ${carrier.coordinate} -->`,
    introduction(state),
    skills(carrier),
    commands(),
    rules(),
    `${MARKER_END}`,
    "",
  ].join("\n");
  if (!hasExactlyOneRegion(scanMarkedBlocks(block))) {
    throw new TypeError("the rendered section must be exactly one managed region");
  }
  return block;
}
