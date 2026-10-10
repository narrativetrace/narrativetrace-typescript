// SPDX-License-Identifier: BUSL-1.1
// Licensed under the Business Source License 1.1 (see LICENSE); Change Date: four years from publication; Change License: Apache-2.0
// Copyright (c) 2026 Empower Agile
import { type Attachments, hasDoctorReport } from "./feedback-attachments.js";
import type { FeedbackCategory } from "./feedback-category.js";
import { DOCTOR_REPORT_FIELD } from "./value-free-check.js";

/**
 * One problem report, gathered: which runtime and install, which part of the product, which step,
 * the three sentences, the language it is written in, who drafted it, and at most two attachments.
 *
 * INTENT: the single object the gate, the draft, the issue-form URL and the `gh` line all read, so
 * none of them can disagree about what is being filed. Every runtime in the family gathers the same
 * fields under the same names — the issue form is shared, so the field set is a cross-runtime
 * contract, not a TypeScript shape.
 *
 * @llmNote {@link reportFields} is what the gate reads, and it is deliberately EVERY field that
 * reaches a URL or a body file — including the install coordinate and the agent line, which look
 * harmless and are the two fields a wrapper script is most likely to interpolate something into.
 */

/**
 * The three sentences that are the report: what was done, what happened, what was expected.
 *
 * INTENT: all three are mandatory, and that is the whole design of the field set. "It does not
 * work" is not a report; the difference between what happened and what was expected is what makes
 * one triageable without a conversation, and a conversation is exactly what nobody gets when the
 * reporter is an agent that has already ended its session.
 */
export interface ProblemNarrative {
  readonly did: string;
  readonly happened: string;
  readonly expected: string;
}

/**
 * Which agent product and model drafted the report, as the agent itself reports them.
 *
 * INTENT: triage needs to know whether a wording problem is one model's reading or everybody's.
 * Neither field is verified and neither is required — an agent that will not name itself still gets
 * to file — so "unknown" is `""` on both, never a guess.
 */
export interface AgentIdentity {
  readonly product: string;
  readonly model: string;
}

/** An agent that did not name itself. */
export const UNKNOWN_AGENT: AgentIdentity = { product: "", model: "" };

export interface FeedbackReport {
  /** The runtime this report is about, lower case and space-free: it becomes a `runtime:` label. */
  readonly runtime: string;
  readonly category: FeedbackCategory;
  /** The NarrativeTrace coordinates this project resolved, or a stated unknown. */
  readonly install: string;
  /** The doctor check id, the skill and step, or the prompt step the problem happened at. */
  readonly step: string;
  readonly narrative: ProblemNarrative;
  /** The language the free text is written in, as a BCP 47 tag. */
  readonly language: string;
  readonly agent: AgentIdentity;
  readonly attachments: Attachments;
}

function requireText(value: string, field: string): void {
  if (typeof value !== "string" || value.trim() === "") {
    throw new RangeError(`a report's "${field}" must not be blank`);
  }
}

/** The one line the report prints for its agent, or `""` when nothing is known. */
export function describeAgent(agent: AgentIdentity): string {
  if (agent.product === "" && agent.model === "") return "";
  return agent.model === "" ? agent.product : `${agent.product} / ${agent.model}`;
}

/**
 * The three sentences, each of which must say something.
 *
 * @throws RangeError when any of them is blank.
 */
export function problemNarrative(
  did: string,
  happened: string,
  expected: string,
): ProblemNarrative {
  for (const [value, field] of [
    [did, "did"],
    [happened, "happened"],
    [expected, "expected"],
  ] as const) {
    if (typeof value !== "string" || value.trim() === "") {
      throw new RangeError(
        `a report's "${field}" must say something — all three sentences are mandatory`,
      );
    }
  }
  return { did, happened, expected };
}

/** A runtime id that could not survive becoming a `runtime:` label is refused at the door. */
function requireLabelableRuntime(runtime: string): void {
  requireText(runtime, "runtime");
  if (runtime !== runtime.toLowerCase() || /\s/.test(runtime)) {
    throw new RangeError(
      `a report's runtime becomes a "runtime:" label, so it must be lower case with no spaces —` +
        ` "${runtime}" is neither`,
    );
  }
}

/**
 * The report these fields describe.
 *
 * @throws RangeError when any mandatory field is blank, the runtime could not become a label, or
 * the category needs the doctor's JSON and the attachment set has none.
 */
export function feedbackReport(input: FeedbackReport): FeedbackReport {
  requireLabelableRuntime(input.runtime);
  requireText(input.install, "install");
  requireText(input.step, "step");
  requireText(input.language, "language");
  if (input.category.requiresDoctorReport && !hasDoctorReport(input.attachments)) {
    throw new RangeError(
      `a "${input.category.id}" report needs the doctor's JSON report — run the doctor, or file` +
        " this under prompt or library instead",
    );
  }
  return { ...input };
}

/**
 * Every field the gate inspects, in the order a refusal lists them.
 *
 * A `Map` built in one order, so the same report always refuses in the same words — which is what
 * lets a test and a corpus row assert on them. The doctor-report key is
 * {@link DOCTOR_REPORT_FIELD}'s own constant rather than a repeated literal: that pair is what
 * scopes the marker exemption, and a renamed field would silently re-arm the rule.
 */
export function reportFields(report: FeedbackReport): Map<string, string> {
  return new Map([
    ["install", report.install],
    ["step", report.step],
    ["did", report.narrative.did],
    ["happened", report.narrative.happened],
    ["expected", report.narrative.expected],
    ["agent", describeAgent(report.agent)],
    [DOCTOR_REPORT_FIELD, report.attachments.doctorReport],
    ["trace", report.attachments.structuralTrace],
  ]);
}

/**
 * True when this report is in a state the rest of the verb may rely on.
 *
 * The categories that apply here: no blank mandatory text; the attachment set's own exclusivity;
 * the category's doctor-report rule; and a runtime canonical enough to become a label.
 */
export function reportInvariant(report: FeedbackReport): boolean {
  const attachments = report.attachments;
  return (
    report.runtime === report.runtime.toLowerCase() &&
    !/\s/.test(report.runtime) &&
    [report.runtime, report.install, report.step, report.language].every(
      (text) => text.trim() !== "",
    ) &&
    [report.narrative.did, report.narrative.happened, report.narrative.expected].every(
      (text) => text.trim() !== "",
    ) &&
    hasDoctorReport(attachments) === (attachments.doctorUnavailable.trim() === "") &&
    (!report.category.requiresDoctorReport || hasDoctorReport(attachments))
  );
}
