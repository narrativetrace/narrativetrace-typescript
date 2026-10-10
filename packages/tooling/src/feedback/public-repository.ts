// SPDX-License-Identifier: BUSL-1.1
// Licensed under the Business Source License 1.1 (see LICENSE); Change Date: four years from publication; Change License: Apache-2.0
// Copyright (c) 2026 Empower Agile
import type { FeedbackReport } from "./feedback-report.js";

/**
 * Where a TypeScript problem report is filed, and the one form it is filed through.
 *
 * INTENT: one place, so the issue-form URL and the `gh` line cannot name different repositories or
 * different templates. Every runtime in the family has its own repository and the SAME form file
 * name — the form is a cross-runtime artifact, the repository is not.
 *
 * @llmNote {@link requireThisRuntime} exists because a wrong answer here is unfixable in public: a
 * report filed into this tracker from another runtime's project is a public issue in the wrong
 * repository, and deleting it does not un-publish it. The report's own runtime field is checked
 * rather than assumed.
 */

/** The public TypeScript repository, `owner/name`. */
export const PUBLIC_REPOSITORY_SLUG = "narrativetrace/narrativetrace-typescript";

/** The issue form every runtime's repository carries under `.github/ISSUE_TEMPLATE/`. */
export const PUBLIC_REPOSITORY_FORM = "narrativetrace-report.yml";

/** The runtime this library files for. */
export const RUNTIME = "typescript";

/**
 * The longest a GitHub label name may be. A label built past this is one the host will refuse, so
 * building it is never the right answer — and an unbounded label is also how a very long language
 * tag blows a URL's own length budget from inside the one parameter nothing else clips.
 */
const LABEL_LIMIT = 50;

/**
 * @throws RangeError when the report is not a report about this runtime.
 */
export function requireThisRuntime(report: FeedbackReport): void {
  if (report.runtime !== RUNTIME) {
    throw new RangeError(
      `this library files into ${PUBLIC_REPOSITORY_SLUG}, and the report's runtime is` +
        ` "${report.runtime}" — file it through that runtime's own tooling`,
    );
  }
}

/**
 * The labels triage sorts on, in a stable order, each inside the platform's own length limit.
 *
 * @llmNote No `agent:<product>` label, deliberately. The agent product is free text as the agent
 * reported it, so a label built from it is a label set strangers extend — and labels from a reporter
 * without push access are silently dropped anyway. The agent line travels as a FIELD, where it is
 * searchable and harmless.
 */
export function issueLabelsFor(report: FeedbackReport): string[] {
  return [
    "from-agent",
    `runtime:${report.runtime}`,
    `category:${report.category.id}`,
    `lang:${report.language}`,
  ].map((label) => label.slice(0, LABEL_LIMIT));
}

/** The issue title: the category, then the step it happened at. */
export function issueTitleFor(report: FeedbackReport): string {
  return `${report.category.id}: ${report.step}`;
}
