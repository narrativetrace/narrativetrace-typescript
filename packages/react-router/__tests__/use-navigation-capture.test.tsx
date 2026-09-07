// SPDX-License-Identifier: BUSL-1.1
// Licensed under the Business Source License 1.1 (see LICENSE); Change Date: four years from publication; Change License: Apache-2.0
// Copyright (c) 2026 Empower Agile
import type { TraceTree } from "@narrativetrace/core";
import { NarrativeTraceProvider, useTraced } from "@narrativetrace/react";
import { act, cleanup, render, screen } from "@testing-library/react";
import { MemoryRouter, Route, Routes, useNavigate } from "react-router-dom";
import { afterEach, describe, expect, test, vi } from "vitest";
import { useNavigationCapture } from "../src/index.js";

afterEach(cleanup);

class Svc {
  greet() {
    return "hi";
  }
}

function TracedPage({ label }: { label: string }) {
  const svc = useTraced(() => new Svc(), "Svc");
  svc.greet();
  return <div data-testid="page">{label}</div>;
}

function NavButton({ to }: { to: string }) {
  const navigate = useNavigate();
  return (
    <button type="button" data-testid="nav" onClick={() => navigate(to)}>
      Go
    </button>
  );
}

function CaptureWrapper({ onCapture }: { onCapture: (tree: TraceTree) => void }) {
  useNavigationCapture(onCapture);
  return null;
}

function NoCaptureWrapper() {
  useNavigationCapture();
  return null;
}

function MultiNavButton() {
  const navigate = useNavigate();
  return (
    <div>
      <button type="button" data-testid="nav-b" onClick={() => navigate("/b")}>
        Go B
      </button>
      <button type="button" data-testid="nav-c" onClick={() => navigate("/c")}>
        Go C
      </button>
    </div>
  );
}

function TestApp({ onCapture }: { onCapture: (tree: TraceTree) => void }) {
  return (
    <NarrativeTraceProvider>
      <MemoryRouter initialEntries={["/a"]}>
        <CaptureWrapper onCapture={onCapture} />
        <MultiNavButton />
        <Routes>
          <Route path="/a" element={<TracedPage label="A" />} />
          <Route path="/b" element={<TracedPage label="B" />} />
          <Route path="/c" element={<TracedPage label="C" />} />
        </Routes>
      </MemoryRouter>
    </NarrativeTraceProvider>
  );
}

describe("useNavigationCapture", () => {
  test("calls onCapture with trace tree on navigation", async () => {
    const captured: TraceTree[] = [];
    render(<TestApp onCapture={(t) => captured.push(t)} />);
    expect(screen.getByTestId("page").textContent).toBe("A");

    await act(() => {
      screen.getByTestId("nav-b").click();
    });

    expect(screen.getByTestId("page").textContent).toBe("B");
    expect(captured.length).toBeGreaterThanOrEqual(1);
    expect(captured[0]!.roots.length).toBeGreaterThan(0);
  });

  test("captured trace only contains source page, not destination", async () => {
    const captured: TraceTree[] = [];

    function NamedPage({ label, className }: { label: string; className: string }) {
      const svc = useTraced(() => ({ render: () => label }), className);
      svc.render();
      return <div data-testid="page">{label}</div>;
    }

    render(
      <NarrativeTraceProvider>
        <MemoryRouter initialEntries={["/a"]}>
          <CaptureWrapper onCapture={(t) => captured.push(t)} />
          <NavButton to="/b" />
          <Routes>
            <Route path="/a" element={<NamedPage label="A" className="PageA" />} />
            <Route path="/b" element={<NamedPage label="B" className="PageB" />} />
          </Routes>
        </MemoryRouter>
      </NarrativeTraceProvider>,
    );

    await act(() => {
      screen.getByTestId("nav").click();
    });

    const classes = captured[0]?.roots.map((r) => r.signature.className) ?? [];
    expect(classes).toEqual(["PageA"]);
  });

  test("resets trace after capture so next navigation gets fresh trace", async () => {
    const captured: TraceTree[] = [];
    render(<TestApp onCapture={(t) => captured.push(t)} />);

    await act(() => {
      screen.getByTestId("nav-b").click();
    });
    await act(() => {
      screen.getByTestId("nav-c").click();
    });

    expect(captured.length).toBe(2);
    expect(captured[1]!.roots.length).toBeGreaterThan(0);
  });

  test("does not call onCapture when tree has no roots", async () => {
    const onCapture = vi.fn();
    function EmptyApp() {
      return (
        <NarrativeTraceProvider>
          <MemoryRouter initialEntries={["/a"]}>
            <CaptureWrapper onCapture={onCapture} />
            <NavButton to="/b" />
            <Routes>
              <Route path="/a" element={<div data-testid="page">A</div>} />
              <Route path="/b" element={<div data-testid="page">B</div>} />
            </Routes>
          </MemoryRouter>
        </NarrativeTraceProvider>
      );
    }

    render(<EmptyApp />);
    await act(() => {
      screen.getByTestId("nav").click();
    });

    expect(onCapture).not.toHaveBeenCalled();
  });

  test("works without onCapture callback", async () => {
    function NoCallbackApp() {
      return (
        <NarrativeTraceProvider>
          <MemoryRouter initialEntries={["/a"]}>
            <NoCaptureWrapper />
            <NavButton to="/b" />
            <Routes>
              <Route path="/a" element={<TracedPage label="A" />} />
              <Route path="/b" element={<TracedPage label="B" />} />
            </Routes>
          </MemoryRouter>
        </NarrativeTraceProvider>
      );
    }

    render(<NoCallbackApp />);
    await act(() => {
      screen.getByTestId("nav").click();
    });

    expect(screen.getByTestId("page").textContent).toBe("B");
  });
});
