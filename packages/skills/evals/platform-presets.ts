// SPDX-License-Identifier: BUSL-1.1
// Licensed under the Business Source License 1.1 (see LICENSE); Change Date: four years from publication; Change License: Apache-2.0
// Copyright (c) 2026 Empower Agile
/**
 * Tier B platform presets (skill-harness-design.md §5.1; the sporadic-lanes note,
 * skill-evals-multi-platform-2026-09-13.md, owner-ruled 2026-09-13): fills `run.ts`'s
 * `--agent-command` seam for each of the three supported CLIs so a trial can be started with just
 * `--platform` — never invented for a platform the seam doesn't name, and always overridable by
 * passing `--agent-command` explicitly (the preset is a default, not a lock-in).
 */

export const PLATFORMS = ["claude", "codex", "gemini"] as const;

export type Platform = (typeof PLATFORMS)[number];

export function isPlatform(value: string): value is Platform {
  return (PLATFORMS as readonly string[]).includes(value);
}

/**
 * Codex and Gemini sit on cheaper plans and run under the sporadic policy (never scheduled,
 * promotion points only, quota-guarded, Tier A/A2-green precondition). Claude runs on the
 * harness's own regular cadence and is exempt from all three.
 */
export const SPORADIC_PLATFORMS: readonly Platform[] = ["codex", "gemini"];

export function isSporadicPlatform(platform: Platform): boolean {
  return (SPORADIC_PLATFORMS as readonly string[]).includes(platform);
}

/**
 * `narrativetrace-doctor` is scoped read-only by design (agent-skills.md: "diagnosis only, and
 * read-only: it never edits, generates, or deletes a file"); every other cataloged skill installs
 * or edits files. Used to pick the least-privileged sandbox/approval mode a trial needs.
 */
export function isReadOnlySkill(skill: string): boolean {
  return skill === "narrativetrace-doctor";
}

/** Codex `-s/--sandbox`: `read-only` for a read-only skill, `workspace-write` otherwise. */
function codexCommand(model: string, skill: string): string {
  const sandbox = isReadOnlySkill(skill) ? "read-only" : "workspace-write";
  return `codex exec --sandbox ${sandbox} --model ${model} "{prompt}"`;
}

/** Gemini `--approval-mode`: `plan` (its read-only mode) for a read-only skill, `auto_edit` otherwise. */
function geminiCommand(model: string, skill: string): string {
  const approvalMode = isReadOnlySkill(skill) ? "plan" : "auto_edit";
  return `gemini -p "{prompt}" --model ${model} --approval-mode ${approvalMode}`;
}

/**
 * The default `--agent-command` template for `platform`, `{prompt}`-substituted by `run.ts`. Each
 * CLI uses its own subscription login — the harness never passes an API key, so no preset ever
 * threads one through.
 */
export function presetAgentCommand(platform: Platform, model: string, skill: string): string {
  if (platform === "claude") return `claude -p "{prompt}" --model ${model} --allowed-tools Bash`;
  if (platform === "codex") return codexCommand(model, skill);
  return geminiCommand(model, skill);
}
