// SPDX-License-Identifier: BUSL-1.1
// Licensed under the Business Source License 1.1 (see LICENSE); Change Date: four years from publication; Change License: Apache-2.0
// Copyright (c) 2026 Empower Agile
import type { TraceTree } from "@narrativetrace/core";
import { expect, test } from "vitest";
import { createDemoContext } from "../src/scenario.js";
import { scenarios } from "../src/scenarios.js";

test("the registry carries the unrefactored scenario with its wiring note", () => {
  expect(scenarios.map((s) => s.title)).toStrictEqual(["Unrefactored: Player Joins World"]);
  expect(scenarios[0]?.wiring).toContain("Only the class and method names differ");
});

test("the scenario prints only the tree, with the generic names the code calls itself", async () => {
  const lines: string[] = [];
  const captured = new Map<string, TraceTree>();
  await scenarios[0]?.run({
    context: createDemoContext(),
    print: (t) => lines.push(t),
    capture: (title, tree) => captured.set(title, tree),
  });
  const output = lines.join("\n");
  expect([...output.matchAll(/^--- (.+) ---$/gm)].map((m) => m[1])).toStrictEqual(["Trace tree"]);
  expect(output).toContain('GameManager.handle(input: "Steve")');
  expect(output).toContain('EntityHandler.execute(kind: "zombie", a: 10, b: 64, c: 10)');
  expect(captured.get("Unrefactored: Player Joins World")?.roots).toHaveLength(1);
});
