// SPDX-License-Identifier: BUSL-1.1
// Licensed under the Business Source License 1.1 (see LICENSE); Change Date: four years from publication; Change License: Apache-2.0
// Copyright (c) 2026 Empower Agile
import type { TraceTree } from "@narrativetrace/core";
import { expect, test } from "vitest";
import { createDemoContext, type Scenario } from "../src/scenario.js";
import { createClarityScenarios, scenarios } from "../src/scenarios.js";

async function runAll(
  list: readonly Scenario[],
): Promise<{ output: string; captured: Map<string, TraceTree> }> {
  const context = createDemoContext();
  const lines: string[] = [];
  const captured = new Map<string, TraceTree>();
  for (const scenario of list) {
    lines.push(`=== ${scenario.title} ===`);
    await scenario.run({
      context,
      print: (t) => lines.push(t),
      capture: (k, v) => captured.set(k, v),
    });
    context.reset();
  }
  return { output: lines.join("\n"), captured };
}

test("the registry lists Java's four naming tiers followed by the report, each with a wiring note", () => {
  expect(scenarios.map((s) => s.title)).toStrictEqual([
    "Scenario 1: Guest Books a Room (Excellent Naming)",
    "Scenario 2: Booking via Manager (Adequate Naming)",
    "Scenario 3: Legacy Data Processing (Poor Naming)",
    "Scenario 4: Guest Repository (Cohesion Mismatch)",
    "Clarity Analysis Report",
  ]);
  for (const scenario of scenarios) expect(scenario.wiring.trim()).not.toBe("");
});

test("each tier prints its tree with named parameters and captures it under its title", async () => {
  const { output, captured } = await runAll(createClarityScenarios());
  expect(output).toContain(
    'ReservationService.confirmReservation(guestId: "G-1001", roomCategory: "deluxe", checkInDate: "2025-06-15", checkOutDate: "2025-06-18")',
  );
  expect(output).toContain('DataProcessor.execute(data: "room-data", val: 42)');
  expect(output).toContain("GuestRepository.dispatchEmail");
  expect([...captured.keys()]).toHaveLength(4);
  expect(captured.get("Scenario 4: Guest Repository (Cohesion Mismatch)")?.roots).toHaveLength(3);
});

test("the report ranks the excellent tier above the poor one and prints the suite summary", async () => {
  const { output } = await runAll(createClarityScenarios());
  const report = output.slice(output.indexOf("CLARITY ANALYSIS REPORT"));
  expect(report).toContain("# Clarity Report");
  const row = (title: string) => report.split("\n").find((l) => l.startsWith(`| ${title}`)) ?? "";
  const score = (title: string) => Number.parseFloat(row(title).split("|")[2] ?? "NaN");
  expect(score("Scenario 1: Guest Books a Room (Excellent Naming)")).toBeGreaterThan(
    score("Scenario 3: Legacy Data Processing (Poor Naming)"),
  );
});

test("the report run on its own says nothing was captured instead of printing an empty table", async () => {
  const [, , , , report] = createClarityScenarios();
  const lines: string[] = [];
  await report?.run({
    context: createDemoContext(),
    print: (t) => lines.push(t),
    capture: () => undefined,
  });
  expect(lines.join("\n")).toContain("No scenarios captured yet");
  expect(lines.join("\n")).not.toContain("# Clarity Report");
});
