// SPDX-License-Identifier: BUSL-1.1
// Licensed under the Business Source License 1.1 (see LICENSE); Change Date: four years from publication; Change License: Apache-2.0
// Copyright (c) 2026 Empower Agile
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, test } from "vitest";

afterEach(cleanup);

import { NarrativeTraceProvider, useNarrativeTrace } from "../src/index.js";

function ContextConsumer() {
  const ctx = useNarrativeTrace();
  return <div data-testid="active">{ctx.isActive ? "yes" : "no"}</div>;
}

function TraceIdConsumer() {
  const ctx = useNarrativeTrace();
  return <div data-testid="traceId">{ctx.traceId()}</div>;
}

describe("NarrativeTraceProvider", () => {
  test("renders children", () => {
    render(
      <NarrativeTraceProvider>
        <span>hello</span>
      </NarrativeTraceProvider>,
    );
    expect(screen.getByText("hello")).toBeDefined();
  });

  test("provides NarrativeContext to children", () => {
    render(
      <NarrativeTraceProvider>
        <ContextConsumer />
      </NarrativeTraceProvider>,
    );
    expect(screen.getByTestId("active").textContent).toBe("yes");
  });

  test("useNarrativeTrace throws outside provider", () => {
    expect(() => render(<ContextConsumer />)).toThrow(
      "useNarrativeTrace must be used within NarrativeTraceProvider",
    );
  });

  test("level off makes context inactive", () => {
    render(
      <NarrativeTraceProvider level="off">
        <ContextConsumer />
      </NarrativeTraceProvider>,
    );
    expect(screen.getByTestId("active").textContent).toBe("no");
  });

  test("default level enables detail tracing", () => {
    function DetailCheck() {
      const ctx = useNarrativeTrace();
      ctx.enterMethod("Svc", "op", []);
      ctx.exitMethodWithReturn('"ok"');
      const tree = ctx.captureTrace();
      return <div data-testid="roots">{tree.roots.length}</div>;
    }
    render(
      <NarrativeTraceProvider>
        <DetailCheck />
      </NarrativeTraceProvider>,
    );
    expect(Number(screen.getByTestId("roots").textContent)).toBe(1);
  });

  test("changing level creates a new context", () => {
    const { rerender } = render(
      <NarrativeTraceProvider level="detail">
        <TraceIdConsumer />
      </NarrativeTraceProvider>,
    );
    const firstId = screen.getByTestId("traceId").textContent;

    rerender(
      <NarrativeTraceProvider level="overview">
        <TraceIdConsumer />
      </NarrativeTraceProvider>,
    );
    const secondId = screen.getByTestId("traceId").textContent;
    expect(secondId).not.toBe(firstId);
  });
});
