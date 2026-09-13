// SPDX-License-Identifier: BUSL-1.1
// Licensed under the Business Source License 1.1 (see LICENSE); Change Date: four years from publication; Change License: Apache-2.0
// Copyright (c) 2026 Empower Agile
import { afterEach, beforeEach, expect, test, vi } from "vitest";
import { mountDemo } from "../src/demo.js";

let root: HTMLElement;

afterEach(() => {
  vi.restoreAllMocks();
});

beforeEach(() => {
  document.body.innerHTML = "";
  root = document.createElement("div");
  document.body.appendChild(root);
});

test("mounting the demo renders a run button and an empty trace panel", () => {
  mountDemo(root);

  const button = root.querySelector<HTMLButtonElement>("button[data-testid='run']");
  const trace = root.querySelector<HTMLPreElement>("pre[data-testid='trace']");
  expect(button?.textContent).toBe("Run traced calculation");
  expect(trace?.textContent).toBe("");
});

test("clicking run renders the traced calculation into the trace panel", () => {
  mountDemo(root);

  root.querySelector<HTMLButtonElement>("button[data-testid='run']")?.click();

  const trace = root.querySelector<HTMLPreElement>("pre[data-testid='trace']");
  // Every non-empty tree opens with its own `trace: <phrase> (<7 hex>)` header (2026-09-13
  // ruling, item 4) — the id is randomly generated, so the phrase is matched, not asserted.
  expect(trace?.textContent).toMatch(
    new RegExp(
      `^trace: [a-z]+ [a-z]+ [a-z]+ \\([0-9a-f]{7}\\)\\n\\n${[
        "Calculator\\.add\\(a: 2, b: 3\\) → 5",
        "Calculator\\.divide\\(a: 10, b: 2\\) → 5",
        "Calculator\\.divide\\(a: 1, b: 0\\) ✗ Error: Division by zero",
      ].join("\\n")}$`,
    ),
  );
});

test("clicking run also renders the trace to the DevTools console", () => {
  const log = vi.spyOn(console, "log").mockImplementation(() => {});
  mountDemo(root);

  root.querySelector<HTMLButtonElement>("button[data-testid=run]")?.click();

  expect(log).toHaveBeenCalledWith("Calculator.add(a: 2, b: 3) → 5");
  expect(log).toHaveBeenCalledWith("Calculator.divide(a: 10, b: 2) → 5");
});

test("a traced failure is caught by the demo and shown as ✗ in the trace panel", () => {
  mountDemo(root);

  expect(() =>
    root.querySelector<HTMLButtonElement>("button[data-testid='run']")?.click(),
  ).not.toThrow();

  const trace = root.querySelector<HTMLPreElement>("pre[data-testid='trace']");
  expect(trace?.textContent).toContain("Calculator.divide(a: 1, b: 0) ✗ Error: Division by zero");
});

const COLLECTOR = "https://collector.test/traces";

function clickRun(): void {
  root.querySelector<HTMLButtonElement>("button[data-testid='run']")?.click();
}

function statusText(): string | null | undefined {
  return root.querySelector("[data-testid='status']")?.textContent;
}

test("clicking run posts the trace to the collector and reports the accepted status", async () => {
  const fetchMock = vi
    .spyOn(globalThis, "fetch")
    .mockResolvedValue(new Response(null, { status: 202 }));
  mountDemo(root, { collectorUrl: COLLECTOR });

  clickRun();

  await vi.waitFor(() => expect(statusText()).toBe("Trace posted to collector (HTTP 202)"));
  const [url, init] = fetchMock.mock.calls[0] ?? [];
  expect(url).toBe(COLLECTOR);
  expect(init?.method).toBe("POST");
  expect(String(init?.body)).toContain("Calculator");
});

test("when the collector is unreachable the page says so instead of failing silently", async () => {
  vi.spyOn(globalThis, "fetch").mockRejectedValue(new TypeError("Failed to fetch"));
  mountDemo(root, { collectorUrl: COLLECTOR });

  clickRun();

  await vi.waitFor(() =>
    expect(statusText()).toBe("Collector unavailable — trace shown above (Failed to fetch)"),
  );
});

test("a collector that rejects the trace is reported as a rejection, not a success", async () => {
  vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response(null, { status: 500 }));
  mountDemo(root, { collectorUrl: COLLECTOR });

  clickRun();

  await vi.waitFor(() => expect(statusText()).toBe("Collector rejected the trace (HTTP 500)"));
});

test("every run starts a fresh trace instead of accumulating previous runs", () => {
  vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response(null, { status: 202 }));
  mountDemo(root, { collectorUrl: COLLECTOR });

  clickRun();
  clickRun();

  const lines = root.querySelector("pre[data-testid='trace']")?.textContent?.split("\n");
  // 2 header lines (the trace's own `trace: <phrase> (<7 hex>)` line plus the blank line after
  // it, 2026-09-13 ruling item 4) + 3 calculation lines — never 6, which accumulation would give.
  expect(lines).toHaveLength(5);
});

test("a non-Error rejection from fetch is still reported readably", async () => {
  vi.spyOn(globalThis, "fetch").mockRejectedValue("socket closed");
  mountDemo(root, { collectorUrl: COLLECTOR });

  clickRun();

  await vi.waitFor(() =>
    expect(statusText()).toBe("Collector unavailable — trace shown above (socket closed)"),
  );
});
