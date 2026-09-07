// SPDX-License-Identifier: BUSL-1.1
// Licensed under the Business Source License 1.1 (see LICENSE); Change Date: four years from publication; Change License: Apache-2.0
// Copyright (c) 2026 Empower Agile
import { afterEach, describe, expect, test, vi } from "vitest";
import * as siteBundle from "../src/site-bundle.js";
import {
  BufferedEventConsumer,
  DualPathPipeline,
  exportJson,
  humanName,
  NarrativeTraceConfig,
  renderIndentedText,
  renderMarkdown,
  renderProse,
  renderToConsole,
  SyncNarrativeContext,
  traceObject,
} from "../src/site-bundle.js";

/**
 * The bundle is exercised the way narrativetrace.ai's page uses it: only through what
 * `site-bundle.ts` exports, never through `../src/index.js` or a workspace package. An
 * import the page cannot make is a test that proves nothing about the vendored file.
 */
class Calculator {
  add(a: number, b: number): number {
    return a + b;
  }

  divide(a: number, b: number): number {
    if (b === 0) throw new Error("Division by zero");
    return a / b;
  }
}

const PARAM_NAMES = { add: ["a", "b"], divide: ["a", "b"] };

function captureCalculatorTrace(context = new SyncNarrativeContext(new NarrativeTraceConfig())) {
  const calc = traceObject(new Calculator(), context, PARAM_NAMES);
  calc.add(2, 3);
  try {
    calc.divide(1, 0);
  } catch {
    // The failure is part of the demo: the proxy re-throws it and the trace records it.
  }
  return context.captureTrace();
}

afterEach(() => vi.restoreAllMocks());

describe("what a page gets from the site bundle", () => {
  test("captures a traced object into a tree without any other import", () => {
    const tree = captureCalculatorTrace();

    expect(tree.roots).toHaveLength(2);
    expect(tree.roots[0]?.signature.methodName).toBe("add");
    expect(tree.roots[1]?.signature.methodName).toBe("divide");
  });

  test("renders the captured calls as indented text — the demo's in-page panel", () => {
    const text = renderIndentedText(captureCalculatorTrace());

    expect(text).toContain("Calculator.add(a: 2, b: 3)");
    expect(text).toContain("5");
  });

  test("records a thrown error rather than swallowing it", () => {
    const text = renderIndentedText(captureCalculatorTrace());

    expect(text).toContain("Calculator.divide(a: 1, b: 0)");
    expect(text).toContain("Division by zero");
  });

  test("re-throws the traced error to the caller unchanged", () => {
    const ctx = new SyncNarrativeContext(new NarrativeTraceConfig());
    const calc = traceObject(new Calculator(), ctx, PARAM_NAMES);

    expect(() => calc.divide(1, 0)).toThrow("Division by zero");
  });

  test("renders the same trace as Markdown", () => {
    const markdown = renderMarkdown(captureCalculatorTrace());

    expect(markdown).toContain("Calculator");
    expect(markdown).toContain("add");
  });

  test("renders the same trace as prose", () => {
    const prose = renderProse(captureCalculatorTrace());

    expect(prose.length).toBeGreaterThan(0);
    expect(prose).toContain("add");
  });

  test("exports the same trace as the versioned JSON envelope", () => {
    const json = JSON.parse(exportJson(captureCalculatorTrace(), { scenario: "site demo" }));

    expect(json.scenario.name).toBe("site demo");
    expect(json.scenario.result).toBe("error");
    expect(json.events.length).toBeGreaterThan(0);
  });

  test("mirrors the trace to the DevTools console", () => {
    const group = vi.spyOn(console, "group").mockImplementation(() => {});
    const log = vi.spyOn(console, "log").mockImplementation(() => {});

    renderToConsole(captureCalculatorTrace());

    expect(log).toHaveBeenCalledWith(expect.stringContaining("Calculator.add(a: 2, b: 3)"));
    expect(group).not.toHaveBeenCalled();
  });

  test("names the captured trace with humanName", () => {
    const tree = captureCalculatorTrace();
    const traceId = tree.roots[0]?.spanContext?.traceId;

    expect(traceId).toMatch(/^[0-9a-f]{32}$/);
    expect(humanName(traceId as never)).toMatch(/^[a-z]+ [a-z]+ [a-z]+$/);
  });

  test("lets a page watch events live while still capturing the tree", () => {
    const seen: string[] = [];
    const pipeline = new DualPathPipeline((e) => seen.push(e.type), new BufferedEventConsumer());
    const ctx = new SyncNarrativeContext(new NarrativeTraceConfig(), undefined, pipeline);

    const tree = captureCalculatorTrace(ctx);

    expect(seen).toEqual(["enter", "exit", "enter", "exit"]);
    expect(tree.roots).toHaveLength(2);
  });

  test("captures nothing once the shared config turns tracing off", () => {
    const config = new NarrativeTraceConfig();
    const ctx = new SyncNarrativeContext(config);
    config.level = "off";

    expect(captureCalculatorTrace(ctx).isEmpty).toBe(true);
  });
});

describe("what the site bundle deliberately withholds", () => {
  // The website's privacy invariant: a file it serves from its own origin must contain no
  // request-making code at all, not merely unused code. These pin the absence, which is the
  // only reason `site-bundle.ts` exists apart from `index.ts`.
  test("omits postToCollector, which the package barrel does export", async () => {
    expect(siteBundle).not.toHaveProperty("postToCollector");
    await expect(import("../src/index.js")).resolves.toHaveProperty("postToCollector");
  });

  test("omits tracedFetch, which the package barrel does export", async () => {
    expect(siteBundle).not.toHaveProperty("tracedFetch");
    await expect(import("../src/index.js")).resolves.toHaveProperty("tracedFetch");
  });

  test("exports exactly the documented surface, so a network export cannot slip in", () => {
    // Deliberately exhaustive rather than a subset check: a new name reaching the vendored
    // file has to be an explicit edit here, reviewed against the privacy invariant.
    expect(Object.keys(siteBundle).sort()).toEqual([
      "BufferedEventConsumer",
      "DualPathPipeline",
      "NarrativeTraceConfig",
      "SyncNarrativeContext",
      "exportJson",
      "humanName",
      "narrated",
      "notTraced",
      "onError",
      "renderIndentedText",
      "renderMarkdown",
      "renderProse",
      "renderToConsole",
      "traceObject",
      "traced",
    ]);
  });
});
