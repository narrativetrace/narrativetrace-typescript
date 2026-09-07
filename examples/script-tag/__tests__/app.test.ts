// SPDX-License-Identifier: BUSL-1.1
// Licensed under the Business Source License 1.1 (see LICENSE); Change Date: four years from publication; Change License: Apache-2.0
// Copyright (c) 2026 Empower Agile
// @vitest-environment jsdom

import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, beforeEach, expect, test, vi } from "vitest";

const PUBLIC_DIR = join(dirname(fileURLToPath(import.meta.url)), "..", "public");
const GLOBAL_BUNDLE = createRequire(import.meta.url).resolve(
  "@narrativetrace/standalone/dist/narrativetrace.global.js",
);

/** Runs a classic (non-module) script in the global scope, returning its last expression. */
function runClassicScript(source: string): unknown {
  return new Function(source)();
}

/**
 * Loads the page the way a browser does: the HTML body, then the two classic scripts in order.
 * In a browser a classic script's top-level `var NarrativeTrace` becomes `window.NarrativeTrace`;
 * jsdom-under-vitest does not do that for evaluated source, so the assignment is made explicitly.
 */
function loadPage(): void {
  const html = readFileSync(join(PUBLIC_DIR, "index.html"), "utf8");
  document.body.innerHTML = html.slice(html.indexOf("<body>") + 6, html.indexOf("</body>"));
  (window as unknown as Record<string, unknown>).NarrativeTrace = runClassicScript(
    `${readFileSync(GLOBAL_BUNDLE, "utf8")}\nreturn NarrativeTrace;`,
  );
  runClassicScript(readFileSync(join(PUBLIC_DIR, "app.js"), "utf8"));
}

function clickRun(): void {
  document.querySelector<HTMLButtonElement>("button[data-testid='run']")?.click();
}

function traceText(): string | null | undefined {
  return document.querySelector("pre[data-testid='trace']")?.textContent;
}

beforeEach(() => {
  vi.spyOn(console, "log").mockImplementation(() => {});
  vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response(null, { status: 202 }));
});

afterEach(() => {
  vi.restoreAllMocks();
  document.body.innerHTML = "";
});

test("clicking run renders the traced checkout, including the caught failure, into the page", () => {
  loadPage();

  clickRun();

  expect(traceText()?.split("\n")).toEqual([
    'ShoppingCart.add(sku: "P1", qty: 2) → 1',
    'ShoppingCart.add(sku: "P2", qty: 1) → 2',
    'ShoppingCart.checkout(coupon: "SPRING") → {"total": 42, "items": 2}',
    'ShoppingCart.checkout(coupon: "EXPIRED") ✗ Error: Coupon expired',
  ]);
});

function statusText(): string | null | undefined {
  return document.querySelector("p[data-testid='status']")?.textContent;
}

test("after a run the page reports that the collector accepted the trace", async () => {
  loadPage();

  clickRun();

  await vi.waitFor(() => expect(statusText()).toBe("Trace posted to collector (HTTP 202)"));
  const [url, init] = vi.mocked(fetch).mock.calls[0] ?? [];
  expect(url).toBe("/traces");
  expect(init?.method).toBe("POST");
});

test("a collector that answers non-2xx is reported as a rejection", async () => {
  vi.mocked(fetch).mockResolvedValue(new Response(null, { status: 500 }));
  loadPage();

  clickRun();

  await vi.waitFor(() => expect(statusText()).toBe("Collector rejected the trace (HTTP 500)"));
});

test("when the collector is unreachable the page says so and keeps the trace on screen", async () => {
  vi.mocked(fetch).mockRejectedValue(new TypeError("Failed to fetch"));
  loadPage();

  clickRun();

  await vi.waitFor(() =>
    expect(statusText()).toBe("Collector unavailable — trace shown above (Failed to fetch)"),
  );
  expect(traceText()).toContain("ShoppingCart.add");
});
