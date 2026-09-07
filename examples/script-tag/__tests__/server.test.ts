// SPDX-License-Identifier: BUSL-1.1
// Licensed under the Business Source License 1.1 (see LICENSE); Change Date: four years from publication; Change License: Apache-2.0
// Copyright (c) 2026 Empower Agile
import type { AddressInfo } from "node:net";
import { afterEach, beforeEach, expect, test, vi } from "vitest";
import { createDemoServer } from "../src/server.js";

let server: ReturnType<typeof createDemoServer>;
let base: string;

beforeEach(async () => {
  server = createDemoServer();
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
});

afterEach(async () => {
  vi.restoreAllMocks();
  await new Promise<void>((resolve, reject) => server.close((e) => (e ? reject(e) : resolve())));
});

test("GET / serves the demo page as HTML", async () => {
  const res = await fetch(`${base}/`);

  expect(res.status).toBe(200);
  expect(res.headers.get("content-type")).toBe("text/html; charset=utf-8");
  expect(await res.text()).toContain('<script src="/narrativetrace.global.js">');
});

test("GET /narrativetrace.global.js serves the standalone classic-script bundle", async () => {
  const res = await fetch(`${base}/narrativetrace.global.js`);

  expect(res.status).toBe(200);
  expect(res.headers.get("content-type")).toBe("text/javascript; charset=utf-8");
  expect(await res.text()).toContain("NarrativeTrace");
});

test("GET /app.js serves the page's own plain-JavaScript code", async () => {
  const res = await fetch(`${base}/app.js`);

  expect(res.status).toBe(200);
  expect(res.headers.get("content-type")).toBe("text/javascript; charset=utf-8");
  expect(await res.text()).toContain("window.NarrativeTrace");
});

test("POST /traces accepts a trace document and logs its size", async () => {
  const log = vi.spyOn(console, "log").mockImplementation(() => {});
  const body = JSON.stringify({ version: 1, scenario: "probe", events: [] });

  const res = await fetch(`${base}/traces`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body,
  });

  expect(res.status).toBe(202);
  expect(log).toHaveBeenCalledWith(`[collector] received trace (${body.length} bytes)`);
});

test("GET /traces is refused with 405 — the collector only accepts POST", async () => {
  const res = await fetch(`${base}/traces`);

  expect(res.status).toBe(405);
  expect(res.headers.get("allow")).toBe("POST");
});

test("an unknown path is a 404", async () => {
  const res = await fetch(`${base}/nope.js`);

  expect(res.status).toBe(404);
});

test("path traversal cannot read files outside the route table", async () => {
  const res = await fetch(`${base}/../package.json`);
  const encoded = await fetch(`${base}/%2e%2e/package.json`);

  expect(res.status).toBe(404);
  expect(encoded.status).toBe(404);
});
