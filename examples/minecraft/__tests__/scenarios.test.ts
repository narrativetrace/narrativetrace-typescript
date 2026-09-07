// SPDX-License-Identifier: BUSL-1.1
// Licensed under the Business Source License 1.1 (see LICENSE); Change Date: four years from publication; Change License: Apache-2.0
// Copyright (c) 2026 Empower Agile
import type { TraceTree } from "@narrativetrace/core";
import { expect, test } from "vitest";
import { createDemoContext } from "../src/scenario.js";
import { scenarios } from "../src/scenarios.js";

test("the registry carries the refactored scenario with its wiring note", () => {
  expect(scenarios.map((s) => s.title)).toStrictEqual(["Refactored: Player Joins World"]);
  expect(scenarios[0]?.wiring).toContain("paramNames");
});

test("the scenario prints tree, Mermaid and PlantUML with named parameters, and captures the tree", async () => {
  const lines: string[] = [];
  const captured = new Map<string, TraceTree>();
  const events: string[] = [];
  await scenarios[0]?.run({
    context: createDemoContext((e) => events.push(e.type)),
    print: (t) => lines.push(t),
    capture: (title, tree) => captured.set(title, tree),
  });
  const output = lines.join("\n");
  expect([...output.matchAll(/^--- (.+) ---$/gm)].map((m) => m[1])).toStrictEqual([
    "Trace tree",
    "Mermaid",
    "PlantUML",
  ]);
  expect(output).toContain('WorldServer.playerJoined(playerName: "Steve")');
  expect(output).toContain('CreatureSpawner.spawnHostile(type: "zombie", x: 10, y: 64, z: 10)');
  expect(output).not.toContain("arg0");
  expect(captured.get("Refactored: Player Joins World")?.roots).toHaveLength(1);
  expect(events).toContain("enter");
});
