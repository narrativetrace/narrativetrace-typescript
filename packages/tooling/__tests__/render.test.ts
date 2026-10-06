// SPDX-License-Identifier: BUSL-1.1
// Licensed under the Business Source License 1.1 (see LICENSE); Change Date: four years from publication; Change License: Apache-2.0
// Copyright (c) 2026 Empower Agile
import { describe, expect, test } from "vitest";
import { renderHuman, renderJson } from "../src/doctor/render.js";
import type { DoctorReport } from "../src/doctor/types.js";

const report: DoctorReport = {
  exitCode: 1,
  findings: [
    {
      id: "toolchain.node-engine",
      status: "pass",
      message: "Node 20.11.0 satisfies the required >=20",
      fix: "",
      docUrl: "https://example.invalid/installation-guide.md#prerequisites",
      skill: null,
    },
    {
      id: "trap.silent-sink",
      status: "fail",
      message: "traceObject() is used but no consumer or sink was found",
      fix: "Attach a BufferedEventConsumer or call captureTrace().",
      docUrl: "https://example.invalid/configuration-guide.md#8-event-pipeline-buffering",
      skill: "narrativetrace-doctor",
    },
  ],
};

describe("renderHuman", () => {
  test("matches the known-good rendering", () => {
    expect(renderHuman(report)).toMatchSnapshot();
  });

  test("lists failures before passes", () => {
    const lines = renderHuman(report).split("\n");
    const failLine = lines.findIndex((l) => l.startsWith("[FAIL]"));
    const passLine = lines.findIndex((l) => l.startsWith("[PASS]"));
    expect(failLine).toBeGreaterThanOrEqual(0);
    expect(failLine).toBeLessThan(passLine);
  });

  test("summarizes a clean report as 'All checks passed.'", () => {
    const clean: DoctorReport = {
      exitCode: 0,
      findings: [{ ...report.findings[0]!, status: "pass" }],
    };
    expect(renderHuman(clean)).toContain("All checks passed.");
    expect(renderHuman(clean)).not.toContain("Exit code");
  });

  test("omits the skill line for a failure the table maps to no skill", () => {
    const unfixable: DoctorReport = {
      exitCode: 1,
      findings: [{ ...report.findings[1]!, skill: null }],
    };
    expect(renderHuman(unfixable)).not.toContain("skill:");
  });

  test("prints the skill line under the fix line for a failure the table maps to one", () => {
    const lines = renderHuman(report).split("\n");
    const fixLine = lines.findIndex((l) => l.startsWith("  fix:"));
    expect(lines[fixLine + 1]).toBe("  skill: narrativetrace-doctor");
  });
});

describe("renderJson", () => {
  test("round-trips the report as JSON", () => {
    expect(JSON.parse(renderJson(report))).toEqual(report);
  });

  test("emits a literal null for a finding no skill fixes, never an omitted key", () => {
    const noFix: DoctorReport = {
      exitCode: 0,
      findings: [report.findings[0]!],
    };
    expect(renderJson(noFix)).toContain('"skill": null');
  });
});
