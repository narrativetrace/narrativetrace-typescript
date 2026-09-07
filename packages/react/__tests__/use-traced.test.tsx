// SPDX-License-Identifier: BUSL-1.1
// Licensed under the Business Source License 1.1 (see LICENSE); Change Date: four years from publication; Change License: Apache-2.0
// Copyright (c) 2026 Empower Agile
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, test } from "vitest";
import { NarrativeTraceProvider } from "../src/provider.js";
import { useNarrativeTrace } from "../src/use-narrative-trace.js";
import { useTraced } from "../src/use-traced.js";

afterEach(cleanup);

class Calculator {
  add(a: number, b: number) {
    return a + b;
  }
}

function TracedComponent() {
  const calc = useTraced(() => new Calculator(), "Calculator");
  const result = calc.add(2, 3);
  return <div data-testid="result">{result}</div>;
}

function CaptureComponent() {
  const ctx = useNarrativeTrace();
  const calc = useTraced(() => new Calculator(), "Calculator");
  calc.add(1, 2);
  const tree = ctx.captureTrace();
  const rootMethod = tree.roots[0]?.signature.methodName ?? "none";
  const rootClass = tree.roots[0]?.signature.className ?? "none";
  return (
    <div>
      <span data-testid="method">{rootMethod}</span>
      <span data-testid="class">{rootClass}</span>
    </div>
  );
}

function CustomNameComponent() {
  const ctx = useNarrativeTrace();
  const obj = useTraced(() => ({ greet: () => "hi" }), "CustomAlias");
  obj.greet();
  const tree = ctx.captureTrace();
  const rootClass = tree.roots[0]?.signature.className ?? "none";
  return <span data-testid="alias">{rootClass}</span>;
}

describe("useTraced", () => {
  test("className option overrides constructor name in trace", () => {
    render(
      <NarrativeTraceProvider>
        <CustomNameComponent />
      </NarrativeTraceProvider>,
    );
    expect(screen.getByTestId("alias").textContent).toBe("CustomAlias");
  });

  test("traced object returns correct values", () => {
    render(
      <NarrativeTraceProvider>
        <TracedComponent />
      </NarrativeTraceProvider>,
    );
    expect(screen.getByTestId("result").textContent).toBe("5");
  });

  test("changing className recreates traced proxy", () => {
    function RenameComponent({ name }: { name: string }) {
      const ctx = useNarrativeTrace();
      const obj = useTraced(() => ({ op: () => "r" }), name);
      obj.op();
      const tree = ctx.captureTrace();
      const last = tree.roots[tree.roots.length - 1]?.signature.className ?? "none";
      return <span data-testid="cls">{last}</span>;
    }

    const { rerender } = render(
      <NarrativeTraceProvider>
        <RenameComponent name="Alpha" />
      </NarrativeTraceProvider>,
    );
    expect(screen.getByTestId("cls").textContent).toBe("Alpha");

    rerender(
      <NarrativeTraceProvider>
        <RenameComponent name="Beta" />
      </NarrativeTraceProvider>,
    );
    expect(screen.getByTestId("cls").textContent).toBe("Beta");
  });

  test("traced calls appear in trace tree", () => {
    render(
      <NarrativeTraceProvider>
        <CaptureComponent />
      </NarrativeTraceProvider>,
    );
    expect(screen.getByTestId("method").textContent).toBe("add");
    expect(screen.getByTestId("class").textContent).toBe("Calculator");
  });
});
