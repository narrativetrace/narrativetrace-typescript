// SPDX-License-Identifier: BUSL-1.1
// Licensed under the Business Source License 1.1 (see LICENSE); Change Date: four years from publication; Change License: Apache-2.0
// Copyright (c) 2026 Empower Agile
import type { Action } from "./action.js";

/**
 * What actually happened when a plan was applied, action by action.
 *
 * INTENT: the answer a caller reports and exits on. A refusal — planned, or discovered when the
 * filesystem would not cooperate — is DATA here, never an exception, so one impossible action never
 * costs a run the actions that did work.
 */

/** Whether an action happened. */
export type AppliedStatus =
  /** The filesystem now says what the action promised. */
  | "applied"
  /** Nothing was done, and the detail says why. */
  | "refused";

/**
 * One action's outcome.
 *
 * @llmNote A refused result must carry a reason — the same contract a planned refusal holds. A refusal
 * nobody can act on is worse than no refusal at all: it reaches a person as an empty parenthesis in a
 * warning.
 */
export interface AppliedAction {
  /** The action as planned. */
  readonly action: Action;
  /** Whether it happened. */
  readonly status: AppliedStatus;
  /** Why it did not, or `""` when it did. */
  readonly detail: string;
}

/** What a whole run did. */
export interface ExecutionReport {
  /** The coordinate the plan was stamped with. */
  readonly carrier: string;
  /** One entry per action, in plan order. */
  readonly results: readonly AppliedAction[];
}

/**
 * One outcome, validated.
 *
 * @throws {TypeError} when a refusal carries no reason.
 */
export function appliedAction(action: Action, status: AppliedStatus, detail = ""): AppliedAction {
  if (status === "refused" && detail.trim() === "") {
    throw new TypeError(`a refusal carries the reason it refused — ${action.path} gives none`);
  }
  return Object.freeze({ action, status, detail });
}

/**
 * A whole run's report, validated.
 *
 * @throws {TypeError} when the carrier is blank.
 */
export function executionReport(
  carrier: string,
  results: readonly AppliedAction[],
): ExecutionReport {
  if (typeof carrier !== "string" || carrier.trim() === "") {
    throw new TypeError("a report names the carrier the plan came from");
  }
  return Object.freeze({ carrier, results: Object.freeze([...results]) });
}

/** True when anything was refused. */
export function reportHasRefusals(report: ExecutionReport): boolean {
  return report.results.some((result) => result.status === "refused");
}

/** 1 when anything was refused, 0 otherwise — what an entry point returns. */
export function reportExitCode(report: ExecutionReport): number {
  return reportHasRefusals(report) ? 1 : 0;
}
