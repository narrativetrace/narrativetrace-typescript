// SPDX-License-Identifier: BUSL-1.1
// Licensed under the Business Source License 1.1 (see LICENSE); Change Date: four years from publication; Change License: Apache-2.0
// Copyright (c) 2026 Empower Agile
import { type Action, isFileEdit } from "./action.js";
import { type ExecutionReport, reportExitCode } from "./execution-report.js";
import { type InitPlan, planExitCode, planIsEmpty, planRefusals } from "./init-plan.js";
import { renderUnifiedDiff } from "./unified-diff.js";

/**
 * Turns a plan or a report into the three things a caller needs: human text, a unified diff for
 * `--dry-run`, and JSON for whatever wraps the command.
 *
 * INTENT: the same envelope shape the doctor already emits — `{carrier, actions[], exitCode}` — so a
 * skill that gates on one can gate on the other without learning a second format.
 *
 * @llmNote Paths are already `/`-separated project-relative strings by the time an action exists, so a
 * report is the same text wherever it ran.
 */

/** How wide a status or kind column is padded, so the paths line up. */
const COLUMN = 8;

function pad(word: string): string {
  return word.length >= COLUMN ? `${word} ` : `${word}        `.slice(0, COLUMN);
}

function reasonSuffix(action: Action): string {
  return action.kind === "refuse" ? ` — ${action.reason}` : "";
}

/** One line per action, refusals marked, with the carrier and the counts at the top. */
export function renderPlanText(plan: InitPlan): string {
  requirePresent(plan);
  const header = `narrativetrace — ${plan.carrier}`;
  if (planIsEmpty(plan)) return `${header}\nnothing to do.\n`;
  const counts = `${plan.actions.length} action(s), ${planRefusals(plan).length} refusal(s)`;
  const lines = plan.actions.map(
    (action) => `${pad(action.kind)}${action.path}${reasonSuffix(action)}`,
  );
  return [header, counts, "", ...lines, ""].join("\n");
}

/** One line per action, each saying whether it happened. */
export function renderReportText(report: ExecutionReport): string {
  requirePresent(report);
  const refused = report.results.filter((result) => result.status === "refused").length;
  const lines = report.results.map(
    (result) =>
      `${pad(result.status)}${pad(result.action.kind)}${result.action.path}` +
      `${result.detail === "" ? "" : ` — ${result.detail}`}`,
  );
  return [
    `narrativetrace — ${report.carrier}`,
    `${report.results.length - refused} applied, ${refused} refused`,
    "",
    ...lines,
    "",
  ].join("\n");
}

/** The full unified diff a dry run shows: one file at a time, in plan order. */
export function renderPlanDiff(plan: InitPlan): string {
  requirePresent(plan);
  return plan.actions
    .map((action) =>
      isFileEdit(action)
        ? renderUnifiedDiff(action.path, action.before, action.after)
        : `# ${action.path} — ${action.kind === "refuse" ? `refused: ${action.reason}` : action.kind}\n`,
    )
    .join("");
}

/** One row of the envelope: what the action is, where, and whether it has happened yet. */
function row(action: Action, status: string): Record<string, string> {
  return { kind: action.kind, path: action.path, status };
}

/** `{"carrier", "actions":[{kind,path,status}], "exitCode"}` for a plan not yet applied. */
export function renderPlanJson(plan: InitPlan): string {
  requirePresent(plan);
  return `${JSON.stringify(
    {
      carrier: plan.carrier,
      actions: plan.actions.map((action) =>
        row(action, action.kind === "refuse" ? "refused" : "planned"),
      ),
      exitCode: planExitCode(plan),
    },
    null,
    2,
  )}\n`;
}

/** The same envelope for a plan that has been applied. */
export function renderReportJson(report: ExecutionReport): string {
  requirePresent(report);
  return `${JSON.stringify(
    {
      carrier: report.carrier,
      actions: report.results.map((result) => row(result.action, result.status)),
      exitCode: reportExitCode(report),
    },
    null,
    2,
  )}\n`;
}

/** How a caller shows one of the two things this library produces. */
export interface RenderOptions {
  /** Machine-readable output instead of human text plus a diff. */
  readonly json?: boolean;
}

/**
 * The whole of what a caller shows for a plan it has NOT applied: the JSON envelope, or the summary
 * followed by the unified diff.
 *
 * @llmNote Both, not either: the summary alone says nothing about what would change, and the diff alone
 * says nothing when there is nothing to change. Every entry point asks THIS rather than composing its
 * own pair — a rule that holds on one surface only is not a rule.
 */
export function renderPlan(plan: InitPlan, options: RenderOptions = {}): string {
  return options.json === true ? renderPlanJson(plan) : renderPlanText(plan) + renderPlanDiff(plan);
}

/** The whole of what a caller shows for a plan it has applied. */
export function renderReport(report: ExecutionReport, options: RenderOptions = {}): string {
  return options.json === true ? renderReportJson(report) : renderReportText(report);
}

function requirePresent(rendered: unknown): void {
  if (rendered == null) throw new TypeError("there is nothing to render");
}
