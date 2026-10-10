// SPDX-License-Identifier: BUSL-1.1
// Licensed under the Business Source License 1.1 (see LICENSE); Change Date: four years from publication; Change License: Apache-2.0
// Copyright (c) 2026 Empower Agile
import { describeAgent, type FeedbackReport } from "./feedback-report.js";
import {
  issueLabelsFor,
  issueTitleFor,
  PUBLIC_REPOSITORY_FORM,
  PUBLIC_REPOSITORY_SLUG,
  requireThisRuntime,
} from "./public-repository.js";

/**
 * The pre-filled issue-form URL — the default way a report is filed, and the only one that needs no
 * tool installed and no credential held by anybody but the person clicking it.
 *
 * INTENT: the user opens this in their own browser, where they are already signed in, and submits
 * it themselves. That click is the approval and the authentication at once, which is why there is
 * no endpoint, no token and nothing for an agent to hold. The agent prints the URL; it never opens
 * it.
 *
 * @llmNote The BODY is deliberately not in the URL. A doctor report and a structural trace are
 * kilobytes, a URL that is too long answers `414 URI Too Long`, and the limit is undocumented — so
 * the long fields live in the body file and the user pastes them. What travels in the URL is the
 * short, searchable half: the category, the install coordinate, the step, the language and the
 * agent line.
 *
 * @llmNote `labels` only takes effect for someone with push access ("labels are silently dropped
 * otherwise"), so for an outside reporter the parameter is harmless and inert; it is here because
 * the same label set is what the `gh` path applies, and two label lists that could disagree would
 * be two triage queues.
 */

/**
 * The length this URL is kept under.
 *
 * The host answers `414 URI Too Long` past an undocumented limit, so the budget is a conservative
 * one we set ourselves and measure, rather than one we discover from a user's failure.
 */
export const ISSUE_FORM_MAX_LENGTH = 4_000;

/** What a field that did not fit ends with, so a reader knows the rest is in the body file. */
export const TRUNCATION_MARKER = " … (continued in the pasted body)";

const BASE = `https://github.com/${PUBLIC_REPOSITORY_SLUG}/issues/new`;

/** Per-field ceiling before the whole-URL budget is enforced. */
const FIELD_LIMIT = 400;

/** The narrowest per-field ceiling worth trying before giving up on shrinking further. */
const MINIMUM_FIELD_LIMIT = 16;

/** What a lone surrogate becomes before encoding: Unicode's own "this byte meant nothing". */
const REPLACEMENT = "�";

const LONE_SURROGATE = /[\ud800-\udbff](?![\udc00-\udfff])|(?<![\ud800-\udbff])[\udc00-\udfff]/g;

/**
 * Clipped to `limit` CODE POINTS, not code units.
 *
 * @llmNote Slicing by code unit split an astral pair in half, and `encodeURIComponent` throws
 * `URIError: URI malformed` on the lone surrogate that is left — so a step carrying emoji turned
 * the `url` channel into a stack trace instead of a link. The spread iterates code points.
 */
function clip(value: string, limit: number): string {
  const points = [...value];
  return points.length <= limit ? value : points.slice(0, limit).join("") + TRUNCATION_MARKER;
}

/**
 * Percent-encoding, with every parameter encoded the same way.
 *
 * `encodeURIComponent` writes a space as `%20` rather than as the `+` of HTML form encoding — which
 * is right inside a form POST and wrong inside a query the browser hands to the host's prefill
 * reader, where the plus signs would show up in the boxes.
 *
 * @llmNote The lone-surrogate fold is not tidiness: `encodeURIComponent` THROWS on one, and a step
 * comes from a project — a test name, a check id, whatever the agent read — so an unpaired
 * surrogate is reachable input, and the hostile corpus is full of them. Folding to U+FFFD says "a
 * character was here and could not be encoded", which is true, and keeps the channel a link.
 */
function encode(value: string): string {
  return encodeURIComponent(value.replace(LONE_SURROGATE, REPLACEMENT));
}

function query(parameters: ReadonlyMap<string, string>): string {
  return [...parameters].map(([name, value]) => `${name}=${encode(value)}`).join("&");
}

function build(report: FeedbackReport, fieldLimit: number): string {
  const parameters = new Map([
    ["template", PUBLIC_REPOSITORY_FORM],
    ["title", clip(issueTitleFor(report), fieldLimit)],
    ["labels", issueLabelsFor(report).join(",")],
    ["runtime", clip(report.runtime, fieldLimit)],
    ["category", report.category.id],
    ["install", clip(report.install, fieldLimit)],
    ["step", clip(report.step, fieldLimit)],
    ["language", clip(report.language, fieldLimit)],
    ["agent", clip(describeAgent(report.agent), fieldLimit)],
  ]);
  return `${BASE}?${query(parameters)}`;
}

/** Whether a built URL is inside the budget — the postcondition {@link issueFormUrl} asserts. */
export function staysUnderBudget(url: string): boolean {
  return url.length <= ISSUE_FORM_MAX_LENGTH;
}

/**
 * The URL for this report.
 *
 * @throws RangeError when the report is not about this runtime.
 * @llmNote The closing check is a POSTCONDITION, not a guard against reachable input: every field
 * is clipped, every label is clipped to the host's own 50-character limit, and the rest of the query
 * is fixed, so `issue-form-url.prop.test.ts` proves no report can exceed the budget. It is kept
 * because the arithmetic is what makes that true, and the day somebody widens a field or adds a
 * parameter this is what refuses rather than handing a user a link the host answers 414 to.
 */
export function issueFormUrl(report: FeedbackReport): string {
  requireThisRuntime(report);
  let url = build(report, FIELD_LIMIT);
  for (let limit = FIELD_LIMIT; !staysUnderBudget(url) && limit > MINIMUM_FIELD_LIMIT; limit /= 2) {
    url = build(report, limit);
  }
  /* v8 ignore next 6 -- the postcondition above: unreachable today by the property test's proof,
     and the whole point of keeping it is the day that proof stops holding. */
  if (!staysUnderBudget(url)) {
    throw new RangeError(
      `the issue-form URL does not fit in ${ISSUE_FORM_MAX_LENGTH} characters even with every` +
        " field clipped — shorten the step and the install coordinate",
    );
  }
  return url;
}
