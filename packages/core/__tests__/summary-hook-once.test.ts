// SPDX-License-Identifier: BUSL-1.1
// Licensed under the Business Source License 1.1 (see LICENSE); Change Date: four years from publication; Change License: Apache-2.0
// Copyright (c) 2026 Empower Agile
import { describe, expect, test } from "vitest";
import { renderStructured } from "../src/rendered-value.js";
import { isRenderingInProgress } from "../src/rendering-guard.js";
import { renderCapture, renderValue } from "../src/value-renderer.js";

// Hook-once (Java: ValueRendererSharedSubgraphBudgetTest "a summary hook runs at most once per
// instance per capture") and B-186 (RenderingGuardNestingTest): the narrative-summary hook is user
// code the renderer invokes on purpose; tracing must not repeat it, and a hook that renders a value
// of its own must not clear the guard for the rest of the walk.
class Counted {
  calls = 0;
  narrativeSummary(): string {
    this.calls++;
    return "counted";
  }
}

describe("narrative-summary hook runs at most once per instance per capture", () => {
  test("one instance reached three ways renders its summary from one hook call (flat)", () => {
    const counted = new Counted();
    const rendered = renderValue([counted, counted, [counted]]);
    expect(rendered).toBe("[counted, counted, [counted]]");
    expect(counted.calls).toBe(1);
  });

  test("the capture path and the structured path together run the hook once", () => {
    const counted = new Counted();
    const graph = [counted, counted, [counted]];
    const capture = renderCapture(graph);
    renderStructured(graph);
    expect(capture.rendered).toBe("[counted, counted, [counted]]");
    expect(counted.calls).toBe(1);
  });

  test("a throwing hook's failure marker is cached too", () => {
    let calls = 0;
    const bad = {
      narrativeSummary(): string {
        calls++;
        throw new Error("boom");
      },
    };
    expect(renderValue([bad, bad])).toBe("[<error: Error>, <error: Error>]");
    expect(calls).toBe(1);
  });
});

describe("B-186 the guard nests across a hook that renders a value of its own", () => {
  test("a hook that re-enters rendering leaves the guard up for the sibling read after it", () => {
    let probed: boolean | undefined;
    const first = {
      narrativeSummary(): string {
        renderValue("a value rendered from inside the hook");
        return "re-entered";
      },
    };
    const second = {
      narrativeSummary(): string {
        probed = isRenderingInProgress();
        return "probed";
      },
    };
    renderValue({ first, second });
    expect(probed).toBe(true);
    expect(isRenderingInProgress()).toBe(false);
  });
});
