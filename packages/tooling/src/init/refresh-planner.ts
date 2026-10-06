// SPDX-License-Identifier: BUSL-1.1
// Licensed under the Business Source License 1.1 (see LICENSE); Change Date: four years from publication; Change License: Apache-2.0
// Copyright (c) 2026 Empower Agile
import type { Action } from "./action.js";
import type { Carrier } from "./carrier.js";
import { initOptions } from "./init-options.js";
import { type InitPlan, initPlan } from "./init-plan.js";
import { planInstall } from "./init-planner.js";
import type { InstalledSkill } from "./installed-skill.js";
import type { ProjectState } from "./project-state.js";

/**
 * Decides what a refresh would rewrite: the pages and the managed section a previous install left
 * behind, brought up to the carrier this run resolves.
 *
 * INTENT: a refresh may KEEP an install current; it may never start one. That is the whole of the
 * difference from the install planner, and it is why this planner exists rather than a flag — "never
 * create" has to be true by construction, not by a caller remembering an option.
 *
 * @llmNote The design (D8) gives this runtime no build hook to hang a refresh on: npm lifecycle scripts
 * run on every install in every CI job, and a test-time hook that rewrites committed files is a surprise
 * diff. So this is the internal shape of a re-run of `init` on an installed project — the mode the
 * doctor's staleness finding sends a reader to — not a documented verb.
 *
 * @sideEffects None. Pure, like the other two planners.
 */

function ours(state: ProjectState): readonly InstalledSkill[] {
  return state.installedSkills.filter((skill) => skill.presence === "ours");
}

/**
 * Whether this project carries an install of ours from a DIFFERENT carrier. A project with no install of
 * ours is never stale: a refresh refreshes what `init` put there and starts nothing.
 */
function isStale(state: ProjectState, coordinate: string): boolean {
  return ours(state).some((skill) => skill.coordinate !== coordinate);
}

/**
 * The install plan, kept down to the actions that REWRITE something already ours. Every other kind — a
 * page to create, a section to append, an import line to add, a refusal — is dropped here, which is what
 * keeps a refresh from starting an install nobody asked for.
 */
function rewrites(state: ProjectState, carrier: Carrier): readonly Action[] {
  if (!isStale(state, carrier.coordinate)) return [];
  return planInstall(state, carrier, initOptions()).actions.filter(
    (action) => action.kind === "replace",
  );
}

/**
 * Whether this project carries an install of ours at all — one skill directory whose page has our
 * provenance line.
 *
 * @llmNote This is the question a caller asks BEFORE it reaches for a carrier. A project that never ran
 * `init` must never resolve one, or every run in every project would warn about skills nobody installed.
 * A directory somebody else owns is not an install of ours, however it is named.
 *
 * @throws {TypeError} when no snapshot is given.
 */
export function isSkillsInstalled(state: ProjectState): boolean {
  if (state == null) throw new TypeError("asking what a project carries needs a project state");
  return ours(state).length > 0;
}

/**
 * The plan a refresh against this carrier would apply — empty unless something is stale.
 *
 * @throws {TypeError} when the snapshot or the carrier is missing.
 */
export function planRefresh(state: ProjectState, carrier: Carrier): InitPlan {
  if (state == null || carrier == null) {
    throw new TypeError("planning a refresh needs a project state and a carrier");
  }
  return initPlan(carrier.coordinate, false, rewrites(state, carrier));
}
