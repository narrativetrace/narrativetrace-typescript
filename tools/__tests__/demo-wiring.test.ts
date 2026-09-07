// SPDX-License-Identifier: BUSL-1.1
// Licensed under the Business Source License 1.1 (see LICENSE); Change Date: four years from publication; Change License: Apache-2.0
// Copyright (c) 2026 Empower Agile
import { existsSync } from "node:fs";
import { describe, expect, test } from "vitest";
import {
  EXAMPLE_NAMES,
  formatExampleList,
  isExampleName,
  type LoadedExample,
  loadExample,
} from "../demo-registry.js";

/**
 * The TS twin of Java's `demoWiringCheck`: every scenario the picker can reach carries a wiring
 * note, titles are unique within an example, and the registry names are what `--list` prints.
 */
describe("demo wiring", () => {
  const loaded: Promise<LoadedExample[]> = Promise.all(EXAMPLE_NAMES.map(loadExample));

  test("--list prints exactly the registry names, one per line, in picker order", () => {
    expect(formatExampleList().split("\n")).toStrictEqual([...EXAMPLE_NAMES]);
    expect(isExampleName("ecommerce")).toBe(true);
    expect(isExampleName("ecommerce ")).toBe(false);
    expect(isExampleName("minecraft-generic")).toBe(false);
  });

  test("every example loads at least one scenario with unique titles", async () => {
    for (const example of await loaded) {
      expect(example.scenarios.length, example.name).toBeGreaterThan(0);
      const titles = example.scenarios.map((s) => s.title);
      expect(new Set(titles).size, example.name).toBe(titles.length);
    }
  });

  test("every scenario carries a non-empty wiring note that says what it is", async () => {
    for (const example of await loaded) {
      for (const scenario of example.scenarios) {
        expect(scenario.wiring.trim(), `${example.name}: ${scenario.title}`).toMatch(/^Wiring:/);
        expect(scenario.wiring.trim().length, scenario.title).toBeGreaterThan(40);
      }
    }
  });

  test("minecraft shows both halves of Java's one example, refactored first", async () => {
    const minecraft = await loadExample("minecraft");
    expect(minecraft.scenarios.map((s) => s.title)).toStrictEqual([
      "Refactored: Player Joins World",
      "Unrefactored: Player Joins World",
    ]);
  });

  test("every example points at a committed glossary and its own source tree", async () => {
    for (const example of await loaded) {
      expect(example.glossaryPath).toBe(`examples/${example.name}/glossary.json`);
      expect(existsSync(example.sourcePrefix), example.sourcePrefix).toBe(true);
    }
  });
});
