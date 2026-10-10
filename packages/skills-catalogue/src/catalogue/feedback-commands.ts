// SPDX-License-Identifier: BUSL-1.1
// Licensed under the Business Source License 1.1 (see LICENSE); Change Date: four years from publication; Change License: Apache-2.0
// Copyright (c) 2026 Empower Agile
import { ApprovalGate } from "./approval-gate.js";

/**
 * Command literals for the problem-report skill — the `feedback` verb of the tested CLI, spelled the
 * way an ADOPTER runs it in their own project.
 *
 * The angle-bracket placeholders are the one thing the agent substitutes: the three sentences and
 * the step are the report, and no literal can carry somebody else's report. The replay in
 * `__tests__/replay.test.ts` fills each with text of its own and runs the real verb.
 *
 * @llmNote There is deliberately no `gh` command here. The `gh` channel is the verb's third way to
 * file, it asks an installed `gh` whether it is signed in, and it stays outside this skill's
 * vocabulary on purpose: the skill NAMES it to somebody who already has that tool and never runs it.
 */

/** Where the verb leaves its two files, relative to the project (the default output directory). */
export const DRAFT_PATH = "narrativetrace-output/feedback/feedback-draft.md";

/** The body file the user pastes into the issue form's last box. */
export const BODY_PATH = "narrativetrace-output/feedback/feedback-body.md";

// snippet:begin reportCommands
const REPORT_FLAGS =
  '--category <category> --step "<where it happened>" --did "<what you did>"' +
  ' --happened "<what happened>" --expected "<what you expected>"';

/** Drafts the report, checks it carries no values, and prints the whole thing. */
export const DRAFT_REPORT = `npx @narrativetrace/cli feedback draft ${REPORT_FLAGS}`;

/** Prints the pre-filled issue-form URL for the same report, once the user has said yes. */
export const PRINT_URL = `npx @narrativetrace/cli feedback url ${REPORT_FLAGS}`;
// snippet:end reportCommands

/**
 * Both files exist — a run that named a `vf.*` rule instead wrote neither, and the exit code says
 * so first. jq-free, like every verify in this catalogue.
 */
export const DRAFT_FILES_WRITTEN = `node -e "const fs=require('fs'); if(!fs.existsSync('${DRAFT_PATH}')||!fs.existsSync('${BODY_PATH}')) process.exit(1);"`;

/** Prints the whole draft, so the reply can carry its text rather than a summary of it. */
export const SHOW_DRAFT = `node -e "process.stdout.write(require('fs').readFileSync('${DRAFT_PATH}','utf8'));"`;

/** What the judged "show it whole" step must find true of the reply. */
export const DRAFT_SHOWN_WHOLE = `judgmental — ${ApprovalGate.shownWhole(DRAFT_PATH)}`;

/** What the judged question step must find true of the reply. */
export const QUESTION_ASKED_LAST = ApprovalGate.askedThenStopped(
  "Do not print the issue URL or run gh before the user says yes — showing the URL is the filing.",
);

/** What the judged print step must find true of the reply. */
export const URL_PRINTED = `judgmental — the printed URL is in the reply, together with the name of ${BODY_PATH} to paste`;
