// SPDX-License-Identifier: BUSL-1.1
// Licensed under the Business Source License 1.1 (see LICENSE); Change Date: four years from publication; Change License: Apache-2.0
// Copyright (c) 2026 Empower Agile
import type { FeedbackDraft } from "./feedback-drafter.js";
import { describeAgent, type FeedbackReport } from "./feedback-report.js";

/**
 * The `--json` envelope for each of the verb's three channels, plus the refusal every one of them
 * can end in.
 *
 * INTENT: an agent reads this, a person reads the human text, and the exit code is in BOTH so
 * neither has to infer it. Every envelope names the channel it came from, because an agent that
 * pipelines `draft` into `url` needs to be able to tell which answer it is holding.
 *
 * @llmNote Two spaces and a trailing newline, exactly like the doctor's own `renderJson`, so a
 * consumer that already reads one of this CLI's JSON outputs reads the other the same way.
 */

function envelope(members: Record<string, unknown>): string {
  return `${JSON.stringify(members, null, 2)}\n`;
}

/** The report's own facts, as every envelope that carries a report spells them. */
function reportFacts(report: FeedbackReport): Record<string, string> {
  return {
    runtime: report.runtime,
    category: report.category.id,
    install: report.install,
    step: report.step,
    language: report.language,
    agent: describeAgent(report.agent),
  };
}

/** A drafted report: the facts, where the two files landed, and why no trace was attached. */
export function feedbackDraftedJson(
  report: FeedbackReport,
  draftFile: string,
  bodyFile: string,
  traceNote: string,
): string {
  return envelope({
    verb: "draft",
    status: "drafted",
    ...reportFacts(report),
    draftFile,
    bodyFile,
    traceNote,
    exitCode: 0,
  });
}

/** The gate refused: every field, rule and reason, and exit 2. */
export function feedbackRefusedJson(
  channel: string,
  refusal: Extract<FeedbackDraft, { status: "refused" }>,
): string {
  return envelope({
    verb: channel,
    status: "refused",
    violations: refusal.violations.map((violation) => ({
      field: violation.field,
      rule: violation.rule.id,
      reason: violation.rule.reason,
    })),
    exitCode: 2,
  });
}

/** The pre-filled URL, and the file whose contents the user pastes once it is open. */
export function feedbackUrlJson(url: string, bodyFile: string): string {
  return envelope({ verb: "url", status: "ready", url, bodyFile, exitCode: 0 });
}

/** The `gh` line, printed and never run. */
export function feedbackGhJson(command: string, bodyFile: string): string {
  return envelope({ verb: "gh", status: "ready", command, bodyFile, exitCode: 0 });
}

/** There is no `gh` line to offer, and why — exit 1: the verb ran, the channel is not open. */
export function feedbackGhUnavailableJson(reason: string): string {
  return envelope({ verb: "gh", status: "unavailable", reason, exitCode: 1 });
}
