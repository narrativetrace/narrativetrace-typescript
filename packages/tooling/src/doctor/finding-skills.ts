// SPDX-License-Identifier: BUSL-1.1
// Licensed under the Business Source License 1.1 (see LICENSE); Change Date: four years from publication; Change License: Apache-2.0
// Copyright (c) 2026 Empower Agile
/**
 * Which catalogue skill fixes each class of finding — the table {@link Finding.skill} reads.
 *
 * INTENT: a finding tells a person what is wrong and how to fix it; an agent with the skills
 * installed can also be told WHICH tested procedure to follow next, by name, instead of
 * improvising one. That mapping lives in one greppable place, not sprinkled across twelve check
 * files where a new check could quietly ship without anybody deciding.
 *
 * @llmNote The rule behind the table: a check that fires because the INSTALL is incomplete points
 * at `add-narrative-tracing` (it owns the dependency block, parameter names, and the reporter
 * wiring); a check that fires on an already-wired project behaving wrongly points at
 * `narrativetrace-doctor` (its steps own proving redaction, reading a rendered trace, and the
 * approval-trace flow). Two ids carry NO skill, and that is a decision rather than an omission: no
 * skill upgrades Node, and no skill can install the skills.
 */

import { frameworkCheckIds } from "../frameworks/framework-table.js";

/** The skill a first install follows: dependencies, parameter names, reporter wiring. */
export const ADD_NARRATIVE_TRACING = "add-narrative-tracing";

/** The skill that reads what a change did and pins it — it owns turning approval mode on. */
export const NARRATIVETRACE_VERIFY = "narrativetrace-verify";

/** The skill a wired-but-misbehaving project follows: diagnosis, read-only. */
export const NARRATIVETRACE_DOCTOR = "narrativetrace-doctor";

const BY_ID: ReadonlyMap<string, string> = new Map([
  // Every framework check fires because the INSTALL is incomplete for a framework the project
  // uses — the skill whose framework step applies the doctor's fixes owns it.
  ...frameworkCheckIds().map((id): [string, string] => [id, ADD_NARRATIVE_TRACING]),
  ["toolchain.vitest-peer", ADD_NARRATIVE_TRACING],
  ["toolchain.sibling-packages", ADD_NARRATIVE_TRACING],
  ["config.reporter-subpath", ADD_NARRATIVE_TRACING],
  ["config.output-env", NARRATIVETRACE_DOCTOR],
  ["config.trace-object-keys", NARRATIVETRACE_DOCTOR],
  ["trap.parameter-arg0", ADD_NARRATIVE_TRACING],
  ["trap.silent-sink", NARRATIVETRACE_DOCTOR],
  ["trap.redaction-proof", NARRATIVETRACE_DOCTOR],
  ["trap.approval-traces", NARRATIVETRACE_DOCTOR],
  ["config.approval-mode", NARRATIVETRACE_VERIFY],
  ["trap.llms-before-you-start", ADD_NARRATIVE_TRACING],
]);

/**
 * Check ids that deliberately carry no skill. Listed rather than left to fall through, so
 * {@link knowsCheck} can tell "decided: none" from "nobody decided yet".
 */
const NO_SKILL = new Set([
  // No skill upgrades Node: the fix is nvm, Volta, or a CI image.
  "toolchain.node-engine",
  // The finding IS that the skills are absent; naming one would point at a missing page.
  "config.skills-installed",
]);

/**
 * The catalogue skill that fixes this class of finding, or `null` when none does.
 *
 * @llmNote Answers `null` for a blank/unknown id rather than throwing: this runs inside
 * {@link pass}/{@link fail}, before either has validated its own `id` argument, so an id-shaped
 * mistake must still surface as that function's own error rather than as a lookup failure here.
 */
export function skillForCheck(id: string): string | null {
  return BY_ID.get(id) ?? null;
}

/** Whether the table has a decision — a skill or a deliberate none — for this check id. */
export function knowsCheck(id: string): boolean {
  return BY_ID.has(id) || NO_SKILL.has(id);
}
