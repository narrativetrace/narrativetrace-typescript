// SPDX-License-Identifier: BUSL-1.1
// Licensed under the Business Source License 1.1 (see LICENSE); Change Date: four years from publication; Change License: Apache-2.0
// Copyright (c) 2026 Empower Agile
import { describe, expect, test } from "vitest";
import { attachmentsOf } from "../../src/feedback/feedback-attachments.js";
import { feedbackCategory } from "../../src/feedback/feedback-category.js";
import { describeRefusal, drafted, draftFeedback } from "../../src/feedback/feedback-drafter.js";
import { PRIVACY_NOTE } from "../../src/feedback/feedback-render.js";
import { feedbackReport, problemNarrative } from "../../src/feedback/feedback-report.js";
import { completeReport, DOCTOR_JSON, STRUCTURAL_TRACE } from "./reports.js";

/**
 * Normalise, gate, render — in that order, because the order is the safety property. A caller
 * cannot reach a URL or a body file past a violation, because a refusal has neither.
 */
describe("drafting a report", () => {
  test("renders the body and a draft that contains it verbatim", () => {
    const result = draftFeedback(completeReport());

    expect(result.status).toBe("drafted");
    if (result.status !== "drafted") return;
    expect(result.draft).toContain(result.body);
    expect(result.draft).toContain(PRIVACY_NOTE);
    expect(result.body).not.toContain(PRIVACY_NOTE);
  });

  test("puts the whole of both attachments in the body, not a summary of them", () => {
    const result = draftFeedback(completeReport());

    if (result.status !== "drafted") throw new Error("expected a drafted report");
    expect(result.body).toContain(DOCTOR_JSON.trim());
    expect(result.body).toContain(STRUCTURAL_TRACE.trim());
  });

  test("says in the body why there is no doctor report, rather than omitting the section", () => {
    const report = feedbackReport({
      ...completeReport(),
      category: feedbackCategory("library"),
      attachments: {
        doctorReport: "",
        doctorUnavailable: "no readable package.json at this project root",
        structuralTrace: "",
      },
    });

    const result = draftFeedback(report);

    if (result.status !== "drafted") throw new Error("expected a drafted report");
    expect(result.body).toContain("No doctor report: no readable package.json");
    expect(result.body).toContain("No structural trace was attached.");
  });

  test("rewrites a home directory before the gate reads it, in every text field", () => {
    const report = feedbackReport({
      ...completeReport(),
      install: "/Users/ada/work/orders",
      narrative: problemNarrative("ran it in /home/ada/work", "it failed", "it to pass"),
    });

    const result = draftFeedback(report);

    if (result.status !== "drafted") throw new Error("expected a drafted report");
    expect(result.report.install).toBe("~/work/orders");
    expect(result.body).toContain("ran it in ~/work");
    expect(result.body).not.toContain("/home/ada");
  });

  test("refuses, naming every rule and field, and renders nothing at all", () => {
    const report = feedbackReport({
      ...completeReport(),
      narrative: problemNarrative(
        'OrderService.placeOrder(customerId: "C-1234")',
        "ada@example.com saw it",
        "it to pass",
      ),
    });

    const result = draftFeedback(report);

    expect(result.status).toBe("refused");
    if (result.status !== "refused") return;
    expect(result.violations.map((violation) => `${violation.field}/${violation.rule.id}`)).toEqual(
      ["did/vf.rendered-call", "happened/vf.email"],
    );
    expect(Object.keys(result)).toEqual(["status", "violations"]);
  });

  test("a refusal prints one line per violation, each naming what to do", () => {
    const result = draftFeedback(
      feedbackReport({
        ...completeReport(),
        step: "Authorization: Bearer eyJpc3MiOiJhZGEifQ",
      }),
    );

    if (result.status !== "refused") throw new Error("expected a refusal");
    const described = describeRefusal(result);

    expect(described.startsWith("This report cannot be filed. 1 rule(s) refused it:\n")).toBe(true);
    expect(described).toContain("step: vf.named-secret");
    expect(described.split("\n").filter((line) => line.startsWith("  - "))).toHaveLength(
      result.violations.length,
    );
  });

  test("reads a report, never null, and says so in its own words", () => {
    for (const absent of [null, undefined, "a report"]) {
      expect(() => draftFeedback(absent as never)).toThrow(
        "there is nothing to draft from a null report",
      );
    }
  });
});

describe("a drafted report", () => {
  test("refuses to exist when its draft does not carry its body byte for byte", () => {
    expect(() => drafted(completeReport(), "a summary of the report", "the body")).toThrow(
      "the draft must contain the body verbatim — a person who approves the draft is approving" +
        " what gets filed, byte for byte",
    );
  });

  test("is the only way the renderer's two texts travel together", () => {
    const report = feedbackReport({
      ...completeReport(),
      attachments: attachmentsOf(DOCTOR_JSON, ""),
    });

    const result = drafted(report, "header\nthe body\nfooter", "the body");

    expect(result).toEqual({
      status: "drafted",
      report,
      draft: "header\nthe body\nfooter",
      body: "the body",
    });
  });
});
