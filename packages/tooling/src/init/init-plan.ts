// SPDX-License-Identifier: BUSL-1.1
// Licensed under the Business Source License 1.1 (see LICENSE); Change Date: four years from publication; Change License: Apache-2.0
// Copyright (c) 2026 Empower Agile
import type { Action } from "./action.js";

/**
 * Everything an install or an uninstall would do, decided before anything is written.
 *
 * INTENT: the seam that makes approval structural. A plan can be rendered as a diff, reviewed, and
 * only then applied — and because it is complete, applying it needs no second look at the project.
 *
 * @llmNote A plan holds at most ONE action per path. Two actions on one path would make the diff a lie
 * (the second would be computed from a state the first has not produced), so the planners never emit
 * one and the factory refuses it.
 */
export interface InitPlan {
  /** The coordinate everything in this plan is stamped with. */
  readonly carrier: string;
  /** Whether this plan is for showing only — a dry run exits 0 even when it refuses. */
  readonly dryRun: boolean;
  /** The actions, in the order a person should read them. */
  readonly actions: readonly Action[];
}

/**
 * A validated, frozen plan.
 *
 * @throws {TypeError} when the carrier is blank, or two actions name one path.
 */
export function initPlan(carrier: string, dryRun: boolean, actions: readonly Action[]): InitPlan {
  if (typeof carrier !== "string" || carrier.trim() === "") {
    throw new TypeError("a plan names the carrier it came from");
  }
  const paths = actions.map((planned) => planned.path);
  if (new Set(paths).size !== paths.length) {
    throw new TypeError(`a plan holds at most one action per path, got ${paths.join(", ")}`);
  }
  return Object.freeze({ carrier, dryRun, actions: Object.freeze([...actions]) });
}

/** True when there is nothing to do — the shape a re-run of an up-to-date install produces. */
export function planIsEmpty(plan: InitPlan): boolean {
  return plan.actions.length === 0;
}

/** Every refusal, in plan order. */
export function planRefusals(plan: InitPlan): readonly Action[] {
  return plan.actions.filter((action) => action.kind === "refuse");
}

/** True when at least one action is a refusal. */
export function planHasRefusals(plan: InitPlan): boolean {
  return planRefusals(plan).length > 0;
}

/**
 * The exit code an entry point returns: 1 when anything was refused, 0 otherwise — and always 0 for a
 * dry run, where a refusal is something shown rather than something that happened.
 */
export function planExitCode(plan: InitPlan): number {
  return !plan.dryRun && planHasRefusals(plan) ? 1 : 0;
}
