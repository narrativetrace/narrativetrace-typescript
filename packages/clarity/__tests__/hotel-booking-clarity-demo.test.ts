// SPDX-License-Identifier: BUSL-1.1
// Licensed under the Business Source License 1.1 (see LICENSE); Change Date: four years from publication; Change License: Apache-2.0
// Copyright (c) 2026 Empower Agile
import { methodSignature, returned, traceNode, traceTree } from "@narrativetrace/core";
import { describe, expect, test } from "vitest";
import { analyzeClarity } from "../src/clarity-analyzer.js";
import { exportClarityJson } from "../src/clarity-json-export.js";

/**
 * Documentation demo (DOC-11): a hotel-booking service written with generic verbs and a "Manager"
 * class scores poorly and surfaces a HIGH-severity issue — the signal the clarity gate acts on.
 * A well-named variant of the same flow scores clean. Guards the clarity contract end-to-end.
 */
function tree(methods: { className: string; methodName: string; params?: string[] }[]) {
  return traceTree(
    methods.map((m) =>
      traceNode(
        methodSignature(
          m.className,
          m.methodName,
          (m.params ?? []).map((p) => ({ name: p, renderedValue: '"x"', redacted: false })),
        ),
        returned('"ok"'),
        [],
      ),
    ),
  );
}

describe("hotel-booking clarity demo", () => {
  test("a generic-verb Manager class raises a HIGH-severity clarity issue", () => {
    const result = analyzeClarity(
      tree([
        { className: "BookingManager", methodName: "process", params: ["d"] },
        { className: "BookingManager", methodName: "handle", params: ["x"] },
      ]),
    );

    const high = result.issues.filter((i) => i.severity === "HIGH");
    expect(high.length).toBeGreaterThan(0);
    // The generic method verbs are flagged.
    expect(result.issues.some((i) => i.category === "method-name")).toBe(true);
    expect(result.overall).toBeLessThan(0.7);
  });

  test("a well-named hotel-booking flow scores clean with no HIGH issues", () => {
    const result = analyzeClarity(
      tree([
        { className: "ReservationService", methodName: "reserveRoom", params: ["guestId"] },
        { className: "ReservationService", methodName: "confirmBooking", params: ["bookingId"] },
      ]),
    );

    expect(result.issues.filter((i) => i.severity === "HIGH")).toHaveLength(0);
    expect(result.overall).toBeGreaterThan(0.6);
  });

  test("the demo's clarity-results.json exposes the HIGH issue to a gate", () => {
    const result = analyzeClarity(
      tree([{ className: "BookingManager", methodName: "process", params: ["d"] }]),
    );
    const json = JSON.parse(exportClarityJson(result, { scenario: "hotel booking" }));
    const severities = json.scenarios[0].issues.map((i: { severity: string }) => i.severity);
    expect(severities).toContain("HIGH");
  });
});
