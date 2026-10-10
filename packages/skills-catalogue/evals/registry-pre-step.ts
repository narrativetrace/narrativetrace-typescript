// SPDX-License-Identifier: BUSL-1.1
// Licensed under the Business Source License 1.1 (see LICENSE); Change Date: four years from publication; Change License: Apache-2.0
// Copyright (c) 2026 Empower Agile
import { MARKETPLACE } from "../src/catalogue-index.js";
import { stagingCommands } from "./staged-snapshot.js";

/**
 * INTENT: the closed vocabulary of REGISTRY deliveries a Tier B case may declare — the step that
 * puts this repository's rendered skill pages where a tool other than our own installer put them,
 * run before the agent starts.
 *
 * A closed list rather than a command string in `case.json`: a case file is data, and data that can
 * name any executable is a shell this harness does not have. Each member owns the exact argv a
 * documented registry line amounts to, so the case replays what a reader runs and nothing beside.
 *
 * @llmNote The id is what a case's `case.json` carries (`"registry": "npx-skills"`); an unknown id
 * is an error at the reading site, never a silently skipped pre-step — a registry case that quietly
 * ran no pre-step would pass as a plain prompt replay.
 */

/**
 * `claude-marketplace`: the Claude Code plugin marketplace, added and its one plugin installed at
 * user scope. `npx-skills`: `npx skills add`, which installs the open-standard pages into the
 * project itself. Both are documented in `documentation/llms.txt` and `agent-skills.md`; a registry
 * documented without a replayed case is what docs-as-tests rule 8 forbids.
 */
export const REGISTRY_PRE_STEPS = ["claude-marketplace", "npx-skills"] as const;

export type RegistryPreStep = (typeof REGISTRY_PRE_STEPS)[number];

/**
 * Whether `value` is one of them. Takes `unknown`, not `string`: what reaches this is a field read
 * out of a committed JSON file, where a number, `null` or an array is as likely as a typo — and a
 * guard that demanded a string first would need a redundant `typeof` check at every call site.
 */
export function isRegistryPreStep(value: unknown): value is RegistryPreStep {
  return (REGISTRY_PRE_STEPS as readonly unknown[]).includes(value);
}

/** What a user types after `@` when installing this repository's one plugin. */
function pluginInstallId(): string {
  return `${MARKETPLACE.name}@${MARKETPLACE.name}`;
}

/**
 * The tool's own lines — what the documentation tells a reader to run, against `stagedSnapshot`
 * where the documentation names the GitHub repository.
 *
 * The marketplace case reads the install back with `plugin details`, so a plugin that was added but
 * delivered no skill fails the pre-step rather than the grader. The `npx` package is deliberately
 * UNPINNED: the case exists to keep a published, versionless line honest, and a pinned replay is
 * blind to the one failure it is there to catch.
 */
export function registryCommands(
  preStep: RegistryPreStep,
  stagedSnapshot: string,
): readonly (readonly string[])[] {
  if (preStep === "claude-marketplace") {
    return [
      ["claude", "plugin", "marketplace", "add", stagedSnapshot],
      ["claude", "plugin", "install", pluginInstallId()],
      ["claude", "plugin", "details", pluginInstallId()],
    ];
  }
  return [["npx", "--yes", "skills", "add", stagedSnapshot, "-y"]];
}

/**
 * Everything `preStep` runs before the agent starts: the staging of the registry surface out of
 * `HEAD` of the repository at `repoRoot`, then the registry tool's own documented commands against
 * the staged tree.
 *
 * The staged tree stands in for the GitHub shorthand a reader types, because the public
 * repository's own `main` carries the pages of the release BEFORE the one these cases describe —
 * the same reason the design sequences everything a user runs against GitHub after the carrier
 * release (D8).
 */
export function preStepCommands(
  preStep: RegistryPreStep,
  repoRoot: string,
  stagedSnapshot: string,
): readonly (readonly string[])[] {
  return [
    ...stagingCommands(repoRoot, stagedSnapshot),
    ...registryCommands(preStep, stagedSnapshot),
  ];
}
