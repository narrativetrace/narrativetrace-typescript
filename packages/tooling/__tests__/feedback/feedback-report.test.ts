// SPDX-License-Identifier: BUSL-1.1
// Licensed under the Business Source License 1.1 (see LICENSE); Change Date: four years from publication; Change License: Apache-2.0
// Copyright (c) 2026 Empower Agile
import { describe, expect, test } from "vitest";
import {
  attachmentsOf,
  attachmentsWithoutDoctorReport,
  hasDoctorReport,
  hasStructuralTrace,
} from "../../src/feedback/feedback-attachments.js";
import { feedbackCategory } from "../../src/feedback/feedback-category.js";
import {
  describeAgent,
  type FeedbackReport,
  feedbackReport,
  problemNarrative,
  reportFields,
  reportInvariant,
  UNKNOWN_AGENT,
} from "../../src/feedback/feedback-report.js";
import { completeReport, DOCTOR_JSON, STRUCTURAL_TRACE } from "./reports.js";

/**
 * The one object the gate, the draft, the issue-form URL and the `gh` line all read — so none of
 * them can disagree about what is being filed.
 */
describe("a feedback category", () => {
  test("is one of the four the form's dropdown offers", () => {
    expect(["prompt", "skill", "doctor", "library"].map(feedbackCategory)).toEqual([
      { id: "prompt", requiresDoctorReport: false },
      { id: "skill", requiresDoctorReport: true },
      { id: "doctor", requiresDoctorReport: true },
      { id: "library", requiresDoctorReport: false },
    ]);
  });

  test("refuses an unknown id rather than filing into the wrong triage queue", () => {
    expect(() => feedbackCategory("runtime")).toThrow(/prompt, skill, doctor or library/);
  });
});

describe("a problem narrative", () => {
  test("needs all three sentences, because the difference between two of them is the report", () => {
    for (const blank of ["", "   "]) {
      expect(() => problemNarrative(blank, "b", "c")).toThrow(/"did"/);
      expect(() => problemNarrative("a", blank, "c")).toThrow(/"happened"/);
      expect(() => problemNarrative("a", "b", blank)).toThrow(/"expected"/);
    }
  });
});

describe("an agent identity", () => {
  test("describes itself as product and model, or as neither", () => {
    expect(describeAgent(UNKNOWN_AGENT)).toBe("");
    expect(describeAgent({ product: "example-cli", model: "" })).toBe("example-cli");
    expect(describeAgent({ product: "example-cli", model: "m" })).toBe("example-cli / m");
  });

  test("reads an unnamed product as empty text, never as a guess", () => {
    expect(UNKNOWN_AGENT).toEqual({ product: "", model: "" });
  });
});

describe("an attachment set", () => {
  test("carries the doctor's JSON or says why it has none, never both and never neither", () => {
    expect(attachmentsOf(DOCTOR_JSON, "").doctorUnavailable).toBe("");
    expect(attachmentsWithoutDoctorReport("the build cannot run", "").doctorReport).toBe("");
    expect(() => attachmentsWithoutDoctorReport("", "")).toThrow(/never both and never neither/);
  });

  test("reads text and never null, so an absent attachment cannot be read as present", () => {
    const message = 'an absent attachment is "", never null';

    expect(() => attachmentsOf(null as unknown as string, "")).toThrow(message);
    expect(() => attachmentsOf(DOCTOR_JSON, null as unknown as string)).toThrow(message);
    expect(() => attachmentsWithoutDoctorReport(null as unknown as string, "")).toThrow(message);
    expect(() => attachmentsWithoutDoctorReport("reason", 7 as unknown as string)).toThrow(message);
  });

  test("reads a doctor report and a trace that are present, not merely non-blank", () => {
    const set = attachmentsOf(DOCTOR_JSON, STRUCTURAL_TRACE);

    expect(hasDoctorReport(set)).toBe(true);
    expect(hasStructuralTrace(set)).toBe(true);
    expect(hasStructuralTrace(attachmentsOf(DOCTOR_JSON, "   "))).toBe(false);
  });

  test("treats a whitespace-only field as blank, not as content", () => {
    expect(() => attachmentsWithoutDoctorReport("   ", "")).toThrow(/never both and never neither/);
  });

  test("has no field for any artifact that carries runtime values", () => {
    expect(Object.keys(attachmentsOf(DOCTOR_JSON, STRUCTURAL_TRACE))).toEqual([
      "doctorReport",
      "doctorUnavailable",
      "structuralTrace",
    ]);
  });
});

describe("a feedback report", () => {
  test("holds its invariant when it is complete", () => {
    expect(reportInvariant(completeReport())).toBe(true);
  });

  test("refuses to exist without the text that makes it triageable", () => {
    expect(() => feedbackReport({ ...completeReport(), step: " " })).toThrow(/"step"/);
    expect(() => feedbackReport({ ...completeReport(), install: "" })).toThrow(/"install"/);
    expect(() => feedbackReport({ ...completeReport(), language: "" })).toThrow(/"language"/);
  });

  test("refuses a runtime that could not become a label, and quotes the one it got", () => {
    for (const runtime of ["TypeScript", "type script"]) {
      expect(() => feedbackReport({ ...completeReport(), runtime })).toThrow(
        `a report's runtime becomes a "runtime:" label, so it must be lower case with no spaces —` +
          ` "${runtime}" is neither`,
      );
    }
  });

  test("names the blank field it refused, rather than refusing in general", () => {
    for (const field of ["install", "step", "language"] as const) {
      expect(() => feedbackReport({ ...completeReport(), [field]: "  " })).toThrow(
        `a report's "${field}" must not be blank`,
      );
    }
    expect(() => feedbackReport({ ...completeReport(), runtime: " " })).toThrow(
      `a report's "runtime" must not be blank`,
    );
  });

  test("refuses a doctor or skill report with no doctor JSON to argue from", () => {
    expect(() =>
      feedbackReport({
        ...completeReport(),
        attachments: attachmentsWithoutDoctorReport("no readable package.json", ""),
      }),
    ).toThrow(/run the doctor, or file this under prompt or library/);
  });

  test("lets a prompt or library report be filed from a project whose doctor cannot run", () => {
    const report = feedbackReport({
      ...completeReport(),
      category: feedbackCategory("library"),
      attachments: attachmentsWithoutDoctorReport("no readable package.json", ""),
    });

    expect(reportInvariant(report)).toBe(true);
  });

  test("exposes every field that reaches a URL or a body file to the gate, in refusal order", () => {
    expect([...reportFields(completeReport()).keys()]).toEqual([
      "install",
      "step",
      "did",
      "happened",
      "expected",
      "agent",
      "doctor report",
      "trace",
    ]);
  });

  /**
   * The invariant is a TEST HOOK, so it is exercised the way a test hook has to be: by handing it
   * objects the factory would have refused. One clause at a time, each from a complete report, so a
   * clause that stopped deciding anything shows up as a `true` where a `false` belongs.
   */
  describe("its invariant, one clause at a time", () => {
    const broken: Record<string, Partial<FeedbackReport>> = {
      "a runtime that is not lower case": { runtime: "TypeScript" },
      "a runtime carrying a space": { runtime: "type script" },
      "a blank runtime": { runtime: " " },
      "a blank install coordinate": { install: "  " },
      "a blank step": { step: "  " },
      "a blank language": { language: "  " },
      "a blank narrative sentence": {
        narrative: { did: "  ", happened: "h", expected: "e" },
      },
      "both halves of the doctor attachment at once": {
        attachments: { doctorReport: "{}", doctorUnavailable: "why", structuralTrace: "" },
      },
      "neither half of the doctor attachment": {
        attachments: { doctorReport: "", doctorUnavailable: "", structuralTrace: "" },
      },
      "no doctor report where the category needs one": {
        attachments: { doctorReport: "", doctorUnavailable: "why", structuralTrace: "" },
      },
    };

    test.each(Object.entries(broken))("refuses %s", (_what, override) => {
      expect(reportInvariant({ ...completeReport(), ...override } as FeedbackReport)).toBe(false);
    });
  });

  test("exposes the install coordinate and the agent line too, not only the free text", () => {
    const fields = reportFields(
      feedbackReport({ ...completeReport(), install: "@narrativetrace/core@0.2.0" }),
    );

    expect(fields.get("install")).toBe("@narrativetrace/core@0.2.0");
    expect(fields.get("agent")).toBe("example-cli / example-model");
  });
});
