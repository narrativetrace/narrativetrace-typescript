// SPDX-License-Identifier: BUSL-1.1
// Licensed under the Business Source License 1.1 (see LICENSE); Change Date: four years from publication; Change License: Apache-2.0
// Copyright (c) 2026 Empower Agile
import { NarrativeTraceConfig, SyncNarrativeContext } from "@narrativetrace/core-web";
import { afterEach, describe, expect, test, vi } from "vitest";
import { tracedFetch } from "../src/traced-fetch.js";

describe("tracedFetch", () => {
  afterEach(() => vi.restoreAllMocks());

  test("attaches traceparent header to outgoing request", async () => {
    const ctx = new SyncNarrativeContext(new NarrativeTraceConfig("detail"));
    const fetch = tracedFetch(ctx);

    const mockResponse = new Response("ok");
    const spy = vi.spyOn(globalThis, "fetch").mockResolvedValue(mockResponse);

    await fetch("https://api.example.com/data");

    expect(spy).toHaveBeenCalledOnce();
    const [, init] = spy.mock.calls[0];
    const headers = new Headers(init?.headers);
    const traceparent = headers.get("traceparent");
    expect(traceparent).toMatch(/^00-[0-9a-f]{32}-[0-9a-f]{16}-01$/);
  });

  test("traceparent contains the context traceId", async () => {
    const ctx = new SyncNarrativeContext(new NarrativeTraceConfig("detail"));
    const fetch = tracedFetch(ctx);
    const traceId = ctx.traceId();

    vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response("ok"));

    await fetch("https://api.example.com/data");

    const [, init] = vi.mocked(globalThis.fetch).mock.calls[0];
    const traceparent = new Headers(init?.headers).get("traceparent")!;
    expect(traceparent).toContain(traceId);
  });

  test("preserves existing headers", async () => {
    const ctx = new SyncNarrativeContext(new NarrativeTraceConfig("detail"));
    const fetch = tracedFetch(ctx);

    vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response("ok"));

    await fetch("https://api.example.com/data", {
      headers: { "Content-Type": "application/json", Authorization: "Bearer token" },
    });

    const [, init] = vi.mocked(globalThis.fetch).mock.calls[0];
    const headers = new Headers(init?.headers);
    expect(headers.get("Content-Type")).toBe("application/json");
    expect(headers.get("Authorization")).toBe("Bearer token");
    expect(headers.get("traceparent")).toBeDefined();
  });

  test("preserves headers from Request input", async () => {
    const ctx = new SyncNarrativeContext(new NarrativeTraceConfig("detail"));
    const wrapped = tracedFetch(ctx);

    const spy = vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response("ok"));
    const request = new Request("https://api.example.com/data", {
      headers: { Authorization: "Bearer token", "X-Test": "1" },
    });

    await wrapped(request);

    const [, init] = spy.mock.calls[0];
    const headers = new Headers(init?.headers);
    expect(headers.get("Authorization")).toBe("Bearer token");
    expect(headers.get("X-Test")).toBe("1");
    expect(headers.get("traceparent")).toMatch(/^00-[0-9a-f]{32}-[0-9a-f]{16}-01$/);
  });

  test("returns the fetch response", async () => {
    const ctx = new SyncNarrativeContext(new NarrativeTraceConfig("detail"));
    const fetch = tracedFetch(ctx);

    vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response("hello"));

    const res = await fetch("https://api.example.com/data");
    expect(await res.text()).toBe("hello");
  });
});
