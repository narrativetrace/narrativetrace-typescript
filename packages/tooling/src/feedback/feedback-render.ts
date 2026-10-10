// SPDX-License-Identifier: BUSL-1.1
// Licensed under the Business Source License 1.1 (see LICENSE); Change Date: four years from publication; Change License: Apache-2.0
// Copyright (c) 2026 Empower Agile
import type { Attachments } from "./feedback-attachments.js";
import { hasDoctorReport, hasStructuralTrace } from "./feedback-attachments.js";
import { describeAgent, type FeedbackReport, type ProblemNarrative } from "./feedback-report.js";

/**
 * The two texts a cleared report becomes: the body that gets filed, and the draft a person reads
 * before deciding to file it.
 *
 * INTENT: one renderer, so the draft cannot say something the body does not. The draft CONTAINS the
 * body verbatim — a drafted report refuses to exist otherwise — because approving a draft has to
 * mean approving what is filed, byte for byte, and a summary is not that.
 *
 * @llmNote Fences are four backticks, not three. An attached doctor report or structural trace is
 * somebody else's text, and a three-backtick fence around text that happens to contain three
 * backticks ends the block early and spills the rest into the issue as prose.
 */

/** The note the draft closes with — what filing publicly actually means (design D5). */
export const PRIVACY_NOTE =
  "Filing on GitHub is public, under your own account, and shows that this project uses" +
  " NarrativeTrace. Nothing is sent anywhere until you choose to file it.";

const FENCE = "````";

function facts(report: FeedbackReport): string {
  const agent = describeAgent(report.agent);
  return [
    `- runtime: ${report.runtime}`,
    `- category: ${report.category.id}`,
    `- install: ${report.install}`,
    `- step: ${report.step}`,
    `- language: ${report.language}`,
    `- agent: ${agent === "" ? "not reported" : agent}`,
  ].join("\n");
}

function narrative(problem: ProblemNarrative): string {
  return [
    `## What I did\n\n${problem.did}`,
    `## What happened\n\n${problem.happened}`,
    `## What I expected\n\n${problem.expected}`,
  ].join("\n\n");
}

function fenced(content: string, language: string): string {
  return `${FENCE}${language}\n${content.trim()}\n${FENCE}`;
}

function attachmentSections(attachments: Attachments): string {
  const doctor = hasDoctorReport(attachments)
    ? fenced(attachments.doctorReport, "json")
    : `No doctor report: ${attachments.doctorUnavailable}`;
  const trace = hasStructuralTrace(attachments)
    ? fenced(attachments.structuralTrace, "")
    : "No structural trace was attached.";
  return `## Doctor report\n\n${doctor}\n\n## Structural trace\n\n${trace}`;
}

/** The report in Markdown: what gets filed, with nothing in it about the process. */
export function renderFeedbackBody(report: FeedbackReport): string {
  return [facts(report), narrative(report.narrative), attachmentSections(report.attachments)].join(
    "\n\n",
  );
}

/** The body, framed by what a person needs in order to decide: the heading and the note. */
export function renderFeedbackDraft(body: string): string {
  return `# NarrativeTrace problem report (draft — nothing has been filed)\n\n${body}\n\n---\n\n${PRIVACY_NOTE}\n`;
}
