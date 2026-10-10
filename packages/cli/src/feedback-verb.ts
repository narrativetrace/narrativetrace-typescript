// SPDX-License-Identifier: BUSL-1.1
// Licensed under the Business Source License 1.1 (see LICENSE); Change Date: four years from publication; Change License: Apache-2.0
// Copyright (c) 2026 Empower Agile
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import {
  chooseTrace,
  type DoctorSnapshot,
  describeRefusal,
  draftFeedback,
  type FeedbackDraft,
  feedbackAttachments,
  feedbackDraftedJson,
  feedbackFiles,
  feedbackGhJson,
  feedbackGhUnavailableJson,
  feedbackRefusedJson,
  feedbackUrlJson,
  ghIssueCreateLine,
  installCoordinate,
  issueFormUrl,
  PRIVACY_NOTE,
  renderJson,
  runDoctor,
} from "@narrativetrace/tooling";
import type { CliDeps } from "./cli.js";
import { type FeedbackArguments, parseFeedbackArguments } from "./feedback-arguments.js";

/**
 * `narrativetrace feedback` — drafts a problem report about NarrativeTrace itself, checks it carries
 * no values from the reporter's own data, and shows the person how to file it.
 *
 * INTENT: the whole decision is the user's, and this verb is built so that it cannot be anybody
 * else's. It writes two files and prints text. It opens no browser, runs no `gh`, and makes no
 * request of its own — the only outward-facing thing it causes is asking an already-installed `gh`
 * whether it is signed in, and only on the channel that would need it.
 *
 * @llmNote Every channel re-drafts from the flags it was given rather than reading a draft back from
 * disk. That is deliberate: there is no hidden state between invocations, so a report can never be
 * filed under a draft that was edited after it was shown. "Never edit the draft after showing it —
 * draft it again and show it again" is enforced by there being nothing else to do.
 *
 * @llmNote The doctor's report is GENERATED here rather than read from a file, which is where this
 * port departs from the Java reference. Nothing in this runtime persists a doctor report — `doctor
 * --json` prints to stdout — so reading a file would make every `doctor` and `skill` report refuse
 * for want of its mandatory attachment. Running the doctor in-process over the same injected
 * snapshot the `doctor` verb uses also means the attachment is always the generator's own bytes.
 *
 * @sideEffects Writes the two files under the project's own output directory, and only when the gate
 * cleared the report.
 */

/** What to do instead when `gh` cannot be used. */
const NO_GH =
  "gh is not installed or not signed in. Use `narrativetrace feedback url` instead: it needs no" +
  " tool and no credential beyond the browser you are already signed in to.";

/** The doctor's own JSON report for this project, or `""` when the doctor cannot run here. */
function doctorReportFor(snapshot: DoctorSnapshot): string {
  return snapshot.rootPackageJson === undefined ? "" : renderJson(runDoctor(snapshot));
}

function write(cwd: string, relative: string, content: string): void {
  const path = join(cwd, relative);
  mkdirSync(dirname(path), { recursive: true });
  // Stryker disable next-line StringLiteral: `""` is equivalent — measured, not assumed. Node
  // accepts an empty encoding string and writes UTF-8 anyway, so no assertion about the file's
  // bytes can tell the two apart. The literal stays because the next reader should not have to
  // know that.
  writeFileSync(path, content, "utf8");
}

function printDraft(
  parsed: FeedbackArguments,
  draft: Extract<FeedbackDraft, { status: "drafted" }>,
  deps: CliDeps,
  traceNote: string,
): number {
  const files = feedbackFiles(deps.env);
  if (parsed.json) {
    deps.print(feedbackDraftedJson(draft.report, files.draftFile, files.bodyFile, traceNote));
    return 0;
  }
  deps.print(draft.draft);
  deps.log(`\nWritten to ${files.draftFile} and ${files.bodyFile}.`);
  if (traceNote !== "") deps.log(`No structural trace attached: ${traceNote}`);
  return 0;
}

function printUrl(
  parsed: FeedbackArguments,
  draft: Extract<FeedbackDraft, { status: "drafted" }>,
  deps: CliDeps,
): number {
  const url = issueFormUrl(draft.report);
  const { bodyFile } = feedbackFiles(deps.env);
  if (parsed.json) {
    deps.print(feedbackUrlJson(url, bodyFile));
    return 0;
  }
  deps.log(url);
  deps.log(
    `\nOpen that in your own browser, where you are already signed in, then paste the contents of` +
      ` ${bodyFile} into the report's last box and submit it.\n\n${PRIVACY_NOTE}`,
  );
  return 0;
}

/** The `gh` channel is not open: a fact, never an error — so it names the channel that is. */
function ghUnavailable(parsed: FeedbackArguments, deps: CliDeps): number {
  deps.error(parsed.json ? feedbackGhUnavailableJson(NO_GH).trimEnd() : NO_GH);
  return 1;
}

function printGh(
  parsed: FeedbackArguments,
  draft: Extract<FeedbackDraft, { status: "drafted" }>,
  deps: CliDeps,
): number {
  if (!deps.ghAuthenticated()) return ghUnavailable(parsed, deps);
  const { bodyFile } = feedbackFiles(deps.env);
  const command = ghIssueCreateLine(draft.report, bodyFile);
  if (parsed.json) {
    deps.print(feedbackGhJson(command, bodyFile));
    return 0;
  }
  deps.log(command);
  deps.log(
    `\nThat line is printed, not run. Running it files the report under your own account.` +
      `\n\n${PRIVACY_NOTE}`,
  );
  return 0;
}

function printFor(
  parsed: FeedbackArguments,
  draft: Extract<FeedbackDraft, { status: "drafted" }>,
  deps: CliDeps,
  traceNote: string,
): number {
  if (parsed.channel === "url") return printUrl(parsed, draft, deps);
  if (parsed.channel === "gh") return printGh(parsed, draft, deps);
  return printDraft(parsed, draft, deps, traceNote);
}

/** Gather, draft, write, print — and refuse before any of the last three when a rule stands. */
function draftThen(parsed: FeedbackArguments, deps: CliDeps): number {
  const snapshot = deps.buildSnapshot(deps.cwd, deps.env);
  const attachments = feedbackAttachments(snapshot, doctorReportFor(snapshot), parsed.trace);
  const draft = draftFeedback(parsed.report(installCoordinate(snapshot), attachments));
  if (draft.status === "refused") {
    deps.error(
      parsed.json
        ? feedbackRefusedJson(parsed.channel, draft).trimEnd()
        : describeRefusal(draft).trimEnd(),
    );
    return 2;
  }
  const files = feedbackFiles(deps.env);
  write(deps.cwd, files.draftFile, draft.draft);
  write(deps.cwd, files.bodyFile, draft.body);
  return printFor(parsed, draft, deps, chooseTrace(snapshot, parsed.trace).reason);
}

/**
 * Runs `feedback` once argv has been recognized as that command. Returns the process exit code.
 *
 * Exit 0 drafted, 1 the channel is not available or the filesystem refused, 2 the command line could
 * not be read or a value-free rule refused the report — and in that last case nothing was written.
 */
export function runFeedbackCommand(rest: readonly string[], deps: CliDeps, usage: string): number {
  const parsed = parseFeedbackArguments(rest);
  if (parsed.help) {
    deps.log(usage);
    return 0;
  }
  if (parsed.error !== undefined) {
    deps.error(`${parsed.error}\n\n${usage}`);
    return 2;
  }
  try {
    return draftThen(parsed, deps);
  } catch (cause) {
    deps.error((cause as Error).message);
    return cause instanceof RangeError || cause instanceof TypeError ? 2 : 1;
  }
}
