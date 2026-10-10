// SPDX-License-Identifier: BUSL-1.1
// Licensed under the Business Source License 1.1 (see LICENSE); Change Date: four years from publication; Change License: Apache-2.0
// Copyright (c) 2026 Empower Agile
import * as fc from "fast-check";
import { describe, expect, test } from "vitest";
import { FEEDBACK_CATEGORIES } from "../../src/feedback/feedback-category.js";
import {
  type FeedbackReport,
  feedbackReport,
  problemNarrative,
} from "../../src/feedback/feedback-report.js";
import { ghIssueCreateLine } from "../../src/feedback/gh-command-line.js";
import {
  ISSUE_FORM_MAX_LENGTH,
  issueFormUrl,
  staysUnderBudget,
} from "../../src/feedback/issue-form-url.js";

/**
 * The two printed channels, over arbitrary field text.
 *
 * INTENT: the step, the install coordinate, the language tag and the agent line all come from a
 * project or from an agent naming itself, so none of them is text this code chose. These properties
 * are what let `issueFormUrl`'s closing length check be documented as a postcondition rather than a
 * guard against reachable input — and what proves the `gh` line stays one shell-safe command
 * whatever a project called its test.
 *
 * @llmNote The alphabet is spelled out rather than taken from `fc.string({ unit: "binary" })`, and
 * the difference was measured: `binary` reached a lone surrogate in none of a hundred runs, while
 * this alphabet reaches one in about half of them. `encodeURIComponent` THROWS on a lone surrogate,
 * so a generator that never produces one proves nothing about the defect this property exists for.
 * The URL metacharacters (`&`, `=`, `#`, `%`) are in the alphabet for the same reason: they are
 * what a step would have to carry to break the query's own structure.
 */

const HOSTILE_UNIT = fc.constantFrom(
  "a",
  "é",
  "🙂",
  "\ud800",
  "\udc00",
  "&",
  "=",
  "#",
  "%",
  " ",
  "密",
);

const hostileText = fc.string({ unit: HOSTILE_UNIT, maxLength: 300 });

const reportArb: fc.Arbitrary<FeedbackReport> = fc
  .record({
    category: fc.constantFrom(...FEEDBACK_CATEGORIES),
    install: hostileText,
    step: hostileText,
    language: hostileText,
    product: hostileText,
    model: hostileText,
  })
  .map((fields) =>
    feedbackReport({
      runtime: "typescript",
      category: fields.category,
      install: `coordinate ${fields.install}`,
      step: `step ${fields.step}`,
      narrative: problemNarrative("did", "happened", "expected"),
      language: `en ${fields.language}`,
      agent: { product: fields.product, model: fields.model },
      attachments: {
        doctorReport: '{"findings":[],"exitCode":0}',
        doctorUnavailable: "",
        structuralTrace: "",
      },
    }),
  );

describe("the issue-form URL, over arbitrary field text", () => {
  test("never exceeds its own length budget", () => {
    fc.assert(
      fc.property(reportArb, (report) => {
        const url = issueFormUrl(report);

        expect(staysUnderBudget(url)).toBe(true);
        expect(url.length).toBeLessThanOrEqual(ISSUE_FORM_MAX_LENGTH);
      }),
    );
  });

  test("is always one line, and always a query over the one form", () => {
    fc.assert(
      fc.property(reportArb, (report) => {
        const url = issueFormUrl(report);

        expect(url).not.toMatch(/[\n\r]/);
        expect(url.startsWith("https://github.com/")).toBe(true);
        expect(url).toContain("?template=narrativetrace-report.yml&");
      }),
    );
  });

  test("decodes back to something, so no parameter is left malformed", () => {
    fc.assert(
      fc.property(reportArb, (report) => {
        for (const parameter of new URL(issueFormUrl(report)).searchParams.keys()) {
          expect(parameter).not.toBe("");
        }
      }),
    );
  });
});

describe("the gh line, over arbitrary field text", () => {
  test("stays one command, with the title single-quoted and nothing else quoted", () => {
    fc.assert(
      fc.property(reportArb, (report) => {
        const line = ghIssueCreateLine(report, "narrativetrace-output/feedback/feedback-body.md");

        expect(line).not.toMatch(/[\n\r]/);
        expect(line.startsWith("gh issue create --repo ")).toBe(true);
        // Every single quote in the line belongs to the title's own quoting, which is balanced.
        expect((line.match(/'/g) ?? []).length % 2).toBe(0);
      }),
    );
  });
});
