// SPDX-License-Identifier: BUSL-1.1
// Licensed under the Business Source License 1.1 (see LICENSE); Change Date: four years from publication; Change License: Apache-2.0
// Copyright (c) 2026 Empower Agile
import type { FeedbackReport } from "./feedback-report.js";
import {
  issueLabelsFor,
  issueTitleFor,
  PUBLIC_REPOSITORY_FORM,
  PUBLIC_REPOSITORY_SLUG,
  requireThisRuntime,
} from "./public-repository.js";

/**
 * The exact `gh issue create` line that files this report — PRINTED, never run.
 *
 * INTENT: the second yes-path, offered only when `gh` is present AND authenticated. It saves the
 * browser step for people who already live in that tool, and it is a convenience rather than the
 * foundation: `gh` ships on hosted runners and is absent from most ordinary machines, which is why
 * the pre-filled URL is the default and this is not.
 *
 * @llmNote This library never executes the line. Running it is the user's act, in their own shell,
 * with their own credential — and because `gh` is outside the skills' closed command vocabulary, an
 * agent that runs it is asked for permission by its harness as well. Two independent gates, neither
 * of which this code can bypass by printing something.
 *
 * @llmNote The title is single-quoted with `'\''` escaping, and that is a security property, not
 * formatting. The step comes from a project — a test name, a check id, whatever the agent read —
 * and an unquoted title containing `;` is a second command in a line we told somebody to paste
 * into their shell.
 */

/** A printed command is one line: a newline inside it would be a second command. */
function oneLine(value: string): string {
  return value.replace(/\s+/g, " ").trim();
}

/** POSIX single-quoting: the only quoting under which a shell interprets nothing. */
function singleQuote(value: string): string {
  return `'${value.replace(/'/g, `'\\''`)}'`;
}

/**
 * The one-line invocation.
 *
 * @param bodyFile where the body was written, as the user will type it.
 * @throws RangeError when the report is not about this runtime, or the path is blank.
 */
export function ghIssueCreateLine(report: FeedbackReport, bodyFile: string): string {
  requireThisRuntime(report);
  if (typeof bodyFile !== "string" || bodyFile.trim() === "") {
    throw new RangeError("the gh line files the body from a FILE — there is no line without one");
  }
  const labels = issueLabelsFor(report).map((label) => `--label ${oneLine(label)}`);
  return [
    "gh issue create",
    `--repo ${PUBLIC_REPOSITORY_SLUG}`,
    `--template ${PUBLIC_REPOSITORY_FORM}`,
    `--title ${singleQuote(oneLine(issueTitleFor(report)))}`,
    `--body-file ${bodyFile.trim()}`,
    ...labels,
  ].join(" ");
}
