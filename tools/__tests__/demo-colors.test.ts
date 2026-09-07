// SPDX-License-Identifier: BUSL-1.1
// Licensed under the Business Source License 1.1 (see LICENSE); Change Date: four years from publication; Change License: Apache-2.0
// Copyright (c) 2026 Empower Agile
import { describe, expect, test } from "vitest";
import {
  colorMode,
  describeSection,
  legend,
  palette,
  RENDERERS_NOTE,
  type StreamState,
  styleLine,
} from "../demo-colors.js";

describe("colorMode", () => {
  test("follows the terminal unless an environment variable decides", () => {
    expect(colorMode({}, true)).toBe(true);
    expect(colorMode({}, false)).toBe(false);
  });

  test("NO_COLOR wins over a terminal; FORCE_COLOR wins over a pipe; FORCE_COLOR=0 does not force", () => {
    expect(colorMode({ NO_COLOR: "1" }, true)).toBe(false);
    expect(colorMode({ NO_COLOR: "" }, true)).toBe(true);
    expect(colorMode({ FORCE_COLOR: "1" }, false)).toBe(true);
    expect(colorMode({ FORCE_COLOR: "0" }, false)).toBe(false);
    expect(colorMode({ FORCE_COLOR: "1", NO_COLOR: "1" }, true)).toBe(false);
  });
});

describe("styleLine", () => {
  const p = palette(true);
  const fresh = (): StreamState => ({ depth: 0, renderersExplained: false });

  test("entries nest by call depth and returns and errors unwind it, never below zero", () => {
    const state = fresh();
    expect(styleLine("→ A.b()", state, p)).toBe(`${p.cyan}→ A.b()${p.reset}`);
    expect(styleLine("→ C.d()", state, p)).toBe(`  ${p.cyan}→ C.d()${p.reset}`);
    expect(styleLine("!! C.d ✖ Error: x", state, p)).toBe(`  ${p.red}!! C.d ✖ Error: x${p.reset}`);
    expect(styleLine("← A.b → 1", state, p)).toBe(`${p.green}← A.b → 1${p.reset}`);
    expect(styleLine("← stray", state, p)).toBe(`${p.green}← stray${p.reset}`);
    expect(state.depth).toBe(0);
  });

  test("a scenario header resets the depth and is yellow", () => {
    const state = { depth: 3, renderersExplained: false };
    expect(styleLine("=== Scenario 2: X ===", state, p)).toBe(
      `${p.yellow}=== Scenario 2: X ===${p.reset}`,
    );
    expect(state.depth).toBe(0);
  });

  test("a known section marker is described once with the renderers note, then just described", () => {
    const state = fresh();
    const first = styleLine("--- Trace tree ---", state, p);
    expect(first).toContain("renderIndentedText");
    expect(first).toContain(RENDERERS_NOTE.split("\n")[0]);
    const second = styleLine("--- Prose ---", state, p);
    expect(second).toContain("renderProse");
    expect(second).not.toContain(RENDERERS_NOTE.split("\n")[0]);
    expect(styleLine("--- Anything else ---", state, p)).toBe(
      `${p.magenta}--- Anything else ---${p.reset}`,
    );
  });

  test("plain lines pass through untouched and without colour codes when colour is off", () => {
    const off = palette(false);
    const state = fresh();
    expect(styleLine("hello", state, off)).toBe("hello");
    expect(styleLine("→ A.b()", state, off)).toBe("→ A.b()");
    expect(styleLine("→ C.d()", state, off)).toBe("  → C.d()");
    expect(Object.values(off).every((code) => code === "")).toBe(true);
  });
});

describe("legend and section descriptions", () => {
  test("the legend explains the three live markers and the views", () => {
    const text = legend(palette(false));
    for (const word of ["→", "←", "!!", "tree", "prose", "diagram"]) expect(text).toContain(word);
  });

  test("every renderer section names the function that produced it", () => {
    expect(describeSection("Trace tree")).toContain("renderIndentedText");
    expect(describeSection("Prose")).toContain("renderProse");
    expect(describeSection("Mermaid")).toContain("renderMermaidSequence");
    expect(describeSection("PlantUML")).toContain("renderPlantUmlSequence");
    expect(describeSection("Other")).toBeUndefined();
  });
});
