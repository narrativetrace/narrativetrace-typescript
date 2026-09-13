// SPDX-License-Identifier: BUSL-1.1
// Licensed under the Business Source License 1.1 (see LICENSE); Change Date: four years from publication; Change License: Apache-2.0
// Copyright (c) 2026 Empower Agile
import { execFileSync } from "node:child_process";
import type { Skill, SkillStep } from "./skill.js";

/**
 * Tier A2 oracle replay (skill-harness-design.md §4.2): mechanically executes a skill's own step
 * data against its fixture, no LLM. Green means the instructions are literally executable today —
 * this is the harness's H1 (does the skill still work), caught deterministically.
 */
export interface StepReplayResult {
  readonly title: string;
  /** `false` when the step is pure narrative (no commands, no verify) — nothing to replay. */
  readonly ran: boolean;
  readonly ok: boolean;
  readonly error?: string;
}

function commandsOf(step: SkillStep): readonly string[] {
  const fromBody = step.body.kind === "commands" ? step.body.commands : [];
  return [...new Set(step.verify ? [...fromBody, step.verify] : fromBody)];
}

/** Runs one shell command in `cwd`, letting a nonzero exit or spawn failure propagate as a throw. */
export function runReplayCommand(command: string, cwd: string): void {
  execFileSync(command, { shell: true, cwd, stdio: "pipe" });
}

function replayStep(step: SkillStep, cwd: string, run: typeof runReplayCommand): StepReplayResult {
  const commands = commandsOf(step);
  if (commands.length === 0) return { title: step.title, ran: false, ok: true };
  try {
    for (const command of commands) run(command, cwd);
    return { title: step.title, ran: true, ok: true };
  } catch (error) {
    return { title: step.title, ran: true, ok: false, error: (error as Error).message };
  }
}

/**
 * Replays every step of `skill` against `cwd` (the skill's fixture, checked out for real). `run` is
 * injectable so a unit test can fake command execution without a real shell.
 */
export function replaySkill(
  skill: Skill,
  cwd: string,
  run: typeof runReplayCommand = runReplayCommand,
): readonly StepReplayResult[] {
  return skill.steps.map((step) => replayStep(step, cwd, run));
}
