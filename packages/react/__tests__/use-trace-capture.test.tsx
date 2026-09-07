// SPDX-License-Identifier: BUSL-1.1
// Licensed under the Business Source License 1.1 (see LICENSE); Change Date: four years from publication; Change License: Apache-2.0
// Copyright (c) 2026 Empower Agile
import type { TraceTree } from "@narrativetrace/core";
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, test } from "vitest";
import { NarrativeTraceProvider } from "../src/provider.js";
import { useNarrativeTrace } from "../src/use-narrative-trace.js";
import { useTraceCapture } from "../src/use-trace-capture.js";
import { useTraced } from "../src/use-traced.js";

afterEach(cleanup);

class Svc {
  greet() {
    return "hi";
  }
}

function CaptureTest({ mode }: { mode: "capture" | "reset" | "captureAndReset" }) {
  const svc = useTraced(() => new Svc(), "Svc");
  const { capture, reset, captureAndReset } = useTraceCapture();
  svc.greet();

  let roots = 0;
  if (mode === "capture") {
    roots = capture().roots.length;
  } else if (mode === "reset") {
    reset();
    roots = capture().roots.length;
  } else {
    const tree = captureAndReset();
    roots = tree.roots.length;
  }
  return <div data-testid="roots">{roots}</div>;
}

describe("useTraceCapture", () => {
  test("capture returns tree with roots", () => {
    render(
      <NarrativeTraceProvider>
        <CaptureTest mode="capture" />
      </NarrativeTraceProvider>,
    );
    expect(Number(screen.getByTestId("roots").textContent)).toBeGreaterThan(0);
  });

  test("reset clears trace", () => {
    render(
      <NarrativeTraceProvider>
        <CaptureTest mode="reset" />
      </NarrativeTraceProvider>,
    );
    expect(screen.getByTestId("roots").textContent).toBe("0");
  });

  test("captureAndReset returns tree then clears", () => {
    render(
      <NarrativeTraceProvider>
        <CaptureTest mode="captureAndReset" />
      </NarrativeTraceProvider>,
    );
    expect(Number(screen.getByTestId("roots").textContent)).toBeGreaterThan(0);
  });

  test("capture callback reflects context after provider change", () => {
    let capturedFn: (() => TraceTree) | null = null;
    let resetFn: (() => void) | null = null;
    let captureAndResetFn: (() => TraceTree) | null = null;

    function Extractor() {
      const svc = useTraced(() => ({ op: () => 1 }), "Svc");
      const { capture, reset, captureAndReset } = useTraceCapture();
      svc.op();
      capturedFn = capture;
      resetFn = reset;
      captureAndResetFn = captureAndReset;
      return <div data-testid="ok">ok</div>;
    }

    const { rerender } = render(
      <NarrativeTraceProvider level="detail">
        <Extractor />
      </NarrativeTraceProvider>,
    );
    const firstCapture = capturedFn;
    const firstReset = resetFn;
    const firstCaptureAndReset = captureAndResetFn;

    rerender(
      <NarrativeTraceProvider level="overview">
        <Extractor />
      </NarrativeTraceProvider>,
    );

    expect(capturedFn).not.toBe(firstCapture);
    expect(resetFn).not.toBe(firstReset);
    expect(captureAndResetFn).not.toBe(firstCaptureAndReset);
  });
});
