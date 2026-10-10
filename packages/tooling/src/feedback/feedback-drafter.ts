// SPDX-License-Identifier: BUSL-1.1
// Licensed under the Business Source License 1.1 (see LICENSE); Change Date: four years from publication; Change License: Apache-2.0
// Copyright (c) 2026 Empower Agile
import { renderFeedbackBody, renderFeedbackDraft } from "./feedback-render.js";
import {
  type FeedbackReport,
  feedbackReport,
  problemNarrative,
  reportFields,
} from "./feedback-report.js";
import { toTilde } from "./home-paths.js";
import {
  describeViolation,
  type ValueFreeViolation,
  valueFreeViolations,
} from "./value-free-check.js";

/**
 * What drafting produced: either a report the gate cleared, with the two texts rendered from it, or
 * a refusal naming every rule that stood in the way.
 *
 * INTENT: a discriminated union rather than a draft carrying a list of problems, so no caller can
 * print a URL or write a body file while a violation stands. The compiler is what enforces the
 * gate's ordering here — a refusal has no body to file, by construction, and narrowing on `status`
 * is the only way to reach one.
 */
export type FeedbackDraft =
  | {
      readonly status: "refused";
      /** Every rule that refused, field order then rule order; never empty. */
      readonly violations: readonly ValueFreeViolation[];
    }
  | {
      readonly status: "drafted";
      /** The report AFTER home-path rewriting — what the two texts were rendered from. */
      readonly report: FeedbackReport;
      /** The whole report plus the privacy note: what the agent SHOWS. */
      readonly draft: string;
      /** The report alone, in Markdown: what gets filed, with nothing about the process. */
      readonly body: string;
    };

/**
 * A cleared report with its two texts.
 *
 * @throws RangeError when the draft does not contain the body verbatim — a person who approves the
 * draft is approving what gets filed, byte for byte, so a draft that summarised its body would make
 * that approval mean something else.
 */
export function drafted(report: FeedbackReport, draft: string, body: string): FeedbackDraft {
  if (!draft.includes(body)) {
    throw new RangeError(
      "the draft must contain the body verbatim — a person who approves the draft is approving" +
        " what gets filed, byte for byte",
    );
  }
  return { status: "drafted", report, draft, body };
}

/** The refusal, one line per violation, in the words the verb prints before exiting 2. */
export function describeRefusal(refusal: Extract<FeedbackDraft, { status: "refused" }>): string {
  const lines = refusal.violations.map((violation) => `  - ${describeViolation(violation)}`);
  return `This report cannot be filed. ${refusal.violations.length} rule(s) refused it:\n${lines.join("\n")}\n`;
}

/** Every text field with its home directories rewritten to `~`. */
function normalise(report: FeedbackReport): FeedbackReport {
  const { narrative, attachments } = report;
  return feedbackReport({
    ...report,
    install: toTilde(report.install),
    step: toTilde(report.step),
    narrative: problemNarrative(
      toTilde(narrative.did),
      toTilde(narrative.happened),
      toTilde(narrative.expected),
    ),
    attachments: {
      doctorReport: toTilde(attachments.doctorReport),
      doctorUnavailable: toTilde(attachments.doctorUnavailable),
      structuralTrace: toTilde(attachments.structuralTrace),
    },
  });
}

/**
 * Normalise, gate, and render — in that order, because the order is the safety property.
 *
 * @throws TypeError when `report` is not a report.
 * @sideEffects None. This returns text; writing it to disk is the entry point's job, and that
 * separation is what lets every test here be hermetic.
 */
export function draftFeedback(report: FeedbackReport): FeedbackDraft {
  if (report === null || typeof report !== "object") {
    throw new TypeError("there is nothing to draft from a null report");
  }
  const normalised = normalise(report);
  const violations = valueFreeViolations(reportFields(normalised));
  if (violations.length > 0) return { status: "refused", violations };
  const body = renderFeedbackBody(normalised);
  return drafted(normalised, renderFeedbackDraft(body), body);
}
