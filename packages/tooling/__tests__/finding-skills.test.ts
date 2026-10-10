// SPDX-License-Identifier: BUSL-1.1
// Licensed under the Business Source License 1.1 (see LICENSE); Change Date: four years from publication; Change License: Apache-2.0
// Copyright (c) 2026 Empower Agile
import { describe, expect, test } from "vitest";
import { knowsCheck, skillForCheck } from "../src/doctor/finding-skills.js";
import { frameworkCheckIds } from "../src/frameworks/framework-table.js";
import { buildSnapshot, DOCTOR_CHECKS, runDoctor } from "../src/index.js";

describe("skillForCheck", () => {
  test.each([
    ["toolchain.vitest-peer", "add-narrative-tracing"],
    ["toolchain.sibling-packages", "add-narrative-tracing"],
    ["config.reporter-subpath", "add-narrative-tracing"],
    ["config.output-env", "narrativetrace-doctor"],
    ["config.trace-object-keys", "narrativetrace-doctor"],
    ["trap.parameter-arg0", "add-narrative-tracing"],
    ["trap.silent-sink", "narrativetrace-doctor"],
    ["trap.redaction-proof", "narrativetrace-doctor"],
    ["trap.approval-traces", "narrativetrace-doctor"],
    ["config.approval-mode", "narrativetrace-verify"],
    ["trap.llms-before-you-start", "add-narrative-tracing"],
  ])("names the skill that fixes %s: %s", (id, skill) => {
    expect(skillForCheck(id)).toBe(skill);
  });

  test.each([
    "toolchain.node-engine",
    "config.skills-installed",
  ])("names no skill for %s, but the table still knows it", (id) => {
    expect(skillForCheck(id)).toBeNull();
    expect(knowsCheck(id)).toBe(true);
  });

  test("every framework-table check points at the skill whose framework step applies it", () => {
    expect(frameworkCheckIds().length).toBeGreaterThan(0);
    for (const id of frameworkCheckIds())
      expect(skillForCheck(id), id).toBe("add-narrative-tracing");
  });

  test("an id the table never heard of is neither known nor mapped", () => {
    expect(skillForCheck("trap.invented-yesterday")).toBeNull();
    expect(knowsCheck("trap.invented-yesterday")).toBe(false);
  });
});

describe("the opt-in clarity skill", () => {
  test("no finding points at it: nothing fails for want of a naming report", () => {
    const report = runDoctor(buildSnapshot(process.cwd(), {}));

    expect(report.findings.length).toBe(DOCTOR_CHECKS.length);
    expect(report.findings.map((finding) => finding.skill)).not.toContain(
      "add-narrativetrace-clarity",
    );
  });
});
