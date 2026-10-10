// SPDX-License-Identifier: BUSL-1.1
// Licensed under the Business Source License 1.1 (see LICENSE); Change Date: four years from publication; Change License: Apache-2.0
// Copyright (c) 2026 Empower Agile
import { describe, expect, test } from "vitest";
import {
  attachmentsOf,
  attachmentsWithoutDoctorReport,
} from "../../src/feedback/feedback-attachments.js";
import { feedbackCategory } from "../../src/feedback/feedback-category.js";
import { draftFeedback } from "../../src/feedback/feedback-drafter.js";
import { PRIVACY_NOTE, renderFeedbackBody } from "../../src/feedback/feedback-render.js";
import {
  type FeedbackReport,
  feedbackReport,
  problemNarrative,
  UNKNOWN_AGENT,
} from "../../src/feedback/feedback-report.js";

/**
 * The body, asserted WHOLE.
 *
 * INTENT: the body is the artifact that gets filed — the one text a stranger reads in a public
 * issue — so every heading, every label and the order they come in is the contract, not an
 * implementation detail. Asserting it line by line through `toContain` left every heading free to
 * change silently, which mutation testing showed one heading at a time.
 *
 * @llmNote The doctor JSON here is deliberately tiny and hand-written, which is the one place in
 * this suite that is allowed: `reports.ts` generates the real thing because it stands in for a
 * GENERATED artifact, while this case is about the FRAME around it, and a frame is only readable
 * with something short inside.
 */

const TINY_DOCTOR_JSON = '{\n  "findings": [],\n  "exitCode": 0\n}';

const TINY_TRACE = "scenario: Order is placed\n\n- OrderService.placeOrder(customerId) → value\n";

function report(overrides: Partial<FeedbackReport> = {}): FeedbackReport {
  return feedbackReport({
    runtime: "typescript",
    category: feedbackCategory("doctor"),
    install: "@narrativetrace/core@0.2.0",
    step: "trap.redaction-proof",
    narrative: problemNarrative("ran the doctor", "it failed again", "it to pass"),
    language: "en",
    agent: { product: "example-cli", model: "example-model" },
    attachments: attachmentsOf(TINY_DOCTOR_JSON, TINY_TRACE),
    ...overrides,
  });
}

describe("the body that gets filed", () => {
  test("is exactly this, headings and order included", () => {
    expect(renderFeedbackBody(report())).toBe(
      `- runtime: typescript
- category: doctor
- install: @narrativetrace/core@0.2.0
- step: trap.redaction-proof
- language: en
- agent: example-cli / example-model

## What I did

ran the doctor

## What happened

it failed again

## What I expected

it to pass

## Doctor report

\`\`\`\`json
{
  "findings": [],
  "exitCode": 0
}
\`\`\`\`

## Structural trace

\`\`\`\`
scenario: Order is placed

- OrderService.placeOrder(customerId) → value
\`\`\`\``,
    );
  });

  test("says what is missing in the words triage reads, when either attachment is absent", () => {
    const bare = renderFeedbackBody(
      report({
        category: feedbackCategory("library"),
        agent: UNKNOWN_AGENT,
        attachments: attachmentsWithoutDoctorReport("the build cannot run", ""),
      }),
    );

    expect(bare).toContain("- agent: not reported");
    expect(bare).toContain("## Doctor report\n\nNo doctor report: the build cannot run\n\n");
    expect(bare).toContain("## Structural trace\n\nNo structural trace was attached.");
  });

  /**
   * Four backticks, not three. An attachment is somebody else's text, and a three-backtick fence
   * around text containing three backticks ends the block early and spills the rest of the report
   * into the issue as prose.
   */
  test("fences an attachment in four backticks, so three inside it cannot end the block", () => {
    const fenced = renderFeedbackBody(
      report({ attachments: attachmentsOf("```\nnot the end\n```", "") }),
    );

    expect(fenced).toContain("````json\n```\nnot the end\n```\n````");
  });

  test("the draft is the body plus exactly the heading and the note", () => {
    const drafted = draftFeedback(report());
    if (drafted.status !== "drafted") throw new Error("expected a drafted report");

    expect(drafted.draft).toBe(
      `# NarrativeTrace problem report (draft — nothing has been filed)\n\n${drafted.body}\n\n---\n\n${PRIVACY_NOTE}\n`,
    );
  });
});
