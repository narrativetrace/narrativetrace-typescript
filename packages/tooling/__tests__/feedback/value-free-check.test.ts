// SPDX-License-Identifier: BUSL-1.1
// Licensed under the Business Source License 1.1 (see LICENSE); Change Date: four years from publication; Change License: Apache-2.0
// Copyright (c) 2026 Empower Agile
import { describe, expect, test } from "vitest";
import {
  DOCTOR_REPORT_FIELD,
  describeViolation,
  rulesRefusing,
  valueFreeViolations,
} from "../../src/feedback/value-free-check.js";
import { REDACTION_MARKER } from "../../src/feedback/value-free-matchers.js";
import { valueFreeRule } from "../../src/feedback/value-free-rule.js";

/**
 * The gate over a report's named fields: what it refuses, in which order, and the one exemption
 * that is scoped to a FIELD rather than to the report.
 */

function fields(entries: Record<string, string>): Map<string, string> {
  return new Map(Object.entries(entries));
}

describe("the value-free gate", () => {
  test("reports every rule that refused, not only the first", () => {
    const refusing = rulesRefusing('OrderService.placeOrder(customerId: "C-1234") — 1ms');

    expect(refusing.map((rule) => rule.id)).toEqual(["vf.rendered-call", "vf.duration"]);
  });

  test("lists violations in field order, then rule order", () => {
    const violations = valueFreeViolations(
      fields({ step: "ada@example.com", happened: "/Users/ada/work" }),
    );

    expect(violations.map((violation) => `${violation.field}/${violation.rule.id}`)).toEqual([
      "step/vf.email",
      "happened/vf.home-path",
    ]);
  });

  test("says nothing about a report that may be filed", () => {
    expect(valueFreeViolations(fields({ step: "trap.redaction-proof" }))).toEqual([]);
  });

  test("a refusal names the field, the rule and what to do about it", () => {
    const described = valueFreeViolations(fields({ happened: "Authorization: Bearer abc" })).map(
      describeViolation,
    );

    expect(described).toEqual([
      expect.stringMatching(/^happened: vf\.named-secret — .*credential/),
    ]);
  });

  test("reads text and fields, never null, and says so in its own words", () => {
    for (const absent of [null, undefined, 7]) {
      expect(() => rulesRefusing(absent as unknown as string)).toThrow(
        'the gate reads text, never null — an absent field is ""',
      );
    }
    for (const absent of [null, undefined, { step: "s" }]) {
      expect(() => valueFreeViolations(absent as unknown as Map<string, string>)).toThrow(
        "the gate reads a report's fields, never null",
      );
    }
    expect(() => valueFreeViolations(new Map([["step", null as unknown as string]]))).toThrow(
      'field "step" is not text — an absent field is ""',
    );
  });

  test("a rule reads text and never null either, however it is reached", () => {
    for (const absent of [null, undefined, 7]) {
      expect(() => valueFreeRule("vf.marker").refuses(absent as unknown as string)).toThrow(
        'a value-free rule reads text, never null — an absent field is ""',
      );
    }
  });
});

/**
 * The exemption the Java reference's own milestone 2 opened with: the doctor's check vocabulary
 * NAMES the redaction marker, so an unscoped marker rule refuses every report from every project
 * that has NarrativeTrace installed at all.
 */
describe("the doctor-report field is exempt from the marker rule, and from nothing else", () => {
  const doctorText = `{"message": "no test asserts ${REDACTION_MARKER} — redaction is unproven"}`;

  test("the marker inside the doctor's own generated JSON does not refuse the report", () => {
    expect(valueFreeViolations(fields({ [DOCTOR_REPORT_FIELD]: doctorText }))).toEqual([]);
  });

  test("the same text in any other field still refuses it", () => {
    expect(valueFreeViolations(fields({ happened: doctorText })).map((v) => v.rule.id)).toEqual([
      "vf.marker",
    ]);
  });

  test("the other nine rules still read the doctor's report", () => {
    const leaky = fields({
      [DOCTOR_REPORT_FIELD]: `{"message": "ada@example.com ran it under /Users/ada/work/orders"}`,
    });

    expect(valueFreeViolations(leaky).map((violation) => violation.rule.id)).toEqual([
      "vf.email",
      "vf.home-path",
    ]);
  });

  test("the text-scoped reading has no field to exempt, which is what the corpus replays", () => {
    expect(rulesRefusing(doctorText).map((rule) => rule.id)).toEqual(["vf.marker"]);
  });
});
