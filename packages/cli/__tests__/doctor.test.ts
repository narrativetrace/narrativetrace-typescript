// SPDX-License-Identifier: BUSL-1.1
// Licensed under the Business Source License 1.1 (see LICENSE); Change Date: four years from publication; Change License: Apache-2.0
// Copyright (c) 2026 Empower Agile
import { describe, expect, test } from "vitest";
import { DOCTOR_CHECKS, runDoctor } from "../src/doctor/doctor.js";
import { cleanSnapshot, snapshot } from "./fixture.js";

describe("runDoctor", () => {
  test("runs every registered check exactly once, in order", () => {
    const report = runDoctor(snapshot());
    expect(report.findings).toHaveLength(DOCTOR_CHECKS.length);
    const ids = report.findings.map((f) => f.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  test("exit code 0 when every check passes", () => {
    const report = runDoctor(cleanSnapshot());
    expect(report.findings.every((f) => f.status === "pass")).toBe(true);
    expect(report.exitCode).toBe(0);
  });

  test("exit code 1 when at least one check fails", () => {
    const report = runDoctor(snapshot({ nodeVersion: "16.0.0" }));
    expect(report.findings.some((f) => f.status === "fail")).toBe(true);
    expect(report.exitCode).toBe(1);
  });

  test("every finding carries a non-empty message and doc URL", () => {
    const report = runDoctor(snapshot({ nodeVersion: "16.0.0" }));
    for (const finding of report.findings) {
      expect(finding.message.length).toBeGreaterThan(0);
      expect(finding.docUrl).toMatch(/^https:\/\//);
      if (finding.status === "fail") expect(finding.fix.length).toBeGreaterThan(0);
      if (finding.status === "pass") expect(finding.fix).toBe("");
    }
  });
});
