// SPDX-License-Identifier: BUSL-1.1
// Licensed under the Business Source License 1.1 (see LICENSE); Change Date: four years from publication; Change License: Apache-2.0
// Copyright (c) 2026 Empower Agile
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { runInNewContext } from "node:vm";
import { describe, expect, test } from "vitest";

const DIST = join(dirname(fileURLToPath(import.meta.url)), "..", "dist");
const ESM_BUNDLE = join(DIST, "narrativetrace.js");
const GLOBAL_BUNDLE = join(DIST, "narrativetrace.global.js");

/** The surface a plain-JavaScript page needs; every name must be reachable from the bundle. */
const BROWSER_API = [
  "NarrativeTraceConfig",
  "SyncNarrativeContext",
  "traceObject",
  "renderIndentedText",
  "renderToConsole",
  "postToCollector",
];

class Cart {
  add(_sku: string, qty: number): number {
    return qty;
  }
}

describe("ES module bundle", () => {
  test("exports the browser-facing API and traces a plain object", async () => {
    const nt = await import(ESM_BUNDLE);

    for (const name of BROWSER_API) expect(nt, name).toHaveProperty(name);
    const ctx = new nt.SyncNarrativeContext(new nt.NarrativeTraceConfig());
    nt.traceObject(new Cart(), ctx, { add: ["sku", "qty"] }).add("P1", 2);
    expect(nt.renderIndentedText(ctx.captureTrace())).toBe('Cart.add(sku: "P1", qty: 2) → 2');
  });
});

/** Globals a browser page has and the bundle may rely on — and nothing from Node. */
function browserLikeGlobals(): Record<string, unknown> {
  return {
    crypto: globalThis.crypto,
    console,
    performance,
    setTimeout,
    clearTimeout,
    setInterval,
    clearInterval,
    AbortController,
    AbortSignal,
    Response,
    fetch: () => Promise.reject(new TypeError("no network in this test")),
  };
}

describe("classic <script> bundle", () => {
  test("defines window.NarrativeTrace with the browser-facing API in a page-like global scope", () => {
    const page = browserLikeGlobals();

    runInNewContext(readFileSync(GLOBAL_BUNDLE, "utf8"), page);

    const nt = page.NarrativeTrace as Record<string, unknown>;
    for (const name of BROWSER_API) expect(nt, name).toHaveProperty(name);
  });
});

describe("classic <script> bundle — tracing", () => {
  test("traces a plain-JS constructor function inside the page-like scope", () => {
    const page = browserLikeGlobals();
    runInNewContext(readFileSync(GLOBAL_BUNDLE, "utf8"), page);

    const rendered = runInNewContext(
      `
      function Cart() {}
      Cart.prototype.add = function (sku, qty) { return qty; };
      var ctx = new NarrativeTrace.SyncNarrativeContext(new NarrativeTrace.NarrativeTraceConfig());
      NarrativeTrace.traceObject(new Cart(), ctx, { add: ["sku", "qty"] }).add("P1", 2);
      NarrativeTrace.renderIndentedText(ctx.captureTrace());
      `,
      page,
    );

    expect(rendered).toBe('Cart.add(sku: "P1", qty: 2) → 2');
  });
});

describe("both bundles are browser-clean", () => {
  test.each([
    ["ES module", ESM_BUNDLE],
    ["classic script", GLOBAL_BUNDLE],
  ])("%s bundle references no Node built-ins or require()", (_label, file) => {
    const source = readFileSync(file, "utf8");

    expect(source).not.toMatch(/["']node:[a-z_/]+["']/);
    expect(source).not.toMatch(/\brequire\(/);
    expect(source).not.toMatch(/\bprocess\.env\b/);
  });
});

describe("type declarations", () => {
  test("are self-contained: no bare @narrativetrace/* specifiers a consumer would have to install", () => {
    const dts = readFileSync(join(DIST, "narrativetrace.d.ts"), "utf8");

    expect(dts).not.toMatch(/from ["']@narrativetrace\//);
    expect(dts).toMatch(/\btraceObject\b/);
  });
});

describe("size budget", () => {
  // ~69 KiB today (raised from 68 KiB, 2026-09-04, for TreeWalk/walkPreOrder — the shared
  // bounded, cycle-safe walker every recursive renderer/exporter now goes through, cross-port
  // mirror of 2026-09-03-unbounded-tree-walks-in-free-renderers.md). Before that, raised from 64
  // KiB, 2026-09-02, for the redaction-defaults widening — twelve more deny-listed names plus
  // JWT/PAN/Set-Cookie value-shape masking, cross-port shape F3. The budget catches accidental
  // growth (a Node package or a large dependency slipping into `noExternal`) before it reaches a
  // page that loads this on every visit — a few KiB of headroom stays tight enough for that,
  // since a real accidental dependency adds far more.
  const BUDGET_BYTES = 70 * 1024;

  test.each([
    ["ES module", ESM_BUNDLE],
    ["classic script", GLOBAL_BUNDLE],
  ])("%s bundle stays within the size budget", (_label, file) => {
    expect(readFileSync(file).byteLength).toBeLessThanOrEqual(BUDGET_BYTES);
  });
});

describe("source entry point", () => {
  test("re-exports exactly what the bundles expose, so the bundles cannot drift from the source", async () => {
    const source = await import("../src/index.js");
    const bundle = await import(ESM_BUNDLE);

    expect(Object.keys(bundle).sort()).toEqual(Object.keys(source).sort());
  });
});
