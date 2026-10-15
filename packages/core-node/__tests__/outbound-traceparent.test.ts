// SPDX-License-Identifier: BUSL-1.1
// Licensed under the Business Source License 1.1 (see LICENSE); Change Date: four years from publication; Change License: Apache-2.0
// Copyright (c) 2026 Empower Agile
import { createServer, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import { afterEach, beforeEach, describe, expect, test } from "vitest";
import { AsyncNarrativeContext, NarrativeTraceConfig, parameterCapture } from "../src/index.js";
import { tracedFetch, traceparentHeaders } from "../src/outbound-traceparent.js";

const TRACEPARENT = /^00-([0-9a-f]{32})-([0-9a-f]{16})-01$/;

let callee: Server;
let received: string | string[] | undefined;

beforeEach(async () => {
  received = undefined;
  callee = createServer((req, res) => {
    received = req.headers.traceparent;
    res.end("ok");
  });
  await new Promise<void>((resolve) => callee.listen(0, "127.0.0.1", resolve));
});

afterEach(async () => {
  await new Promise((resolve) => callee.close(resolve));
});

const url = () => `http://127.0.0.1:${(callee.address() as AddressInfo).port}/`;
const newCtx = () => new AsyncNarrativeContext(new NarrativeTraceConfig("detail"));

describe("traceparentHeaders", () => {
  test("is empty when no span is active", () => {
    expect(traceparentHeaders(newCtx())).toEqual({});
  });

  test("names the current trace and the current span as parent", () => {
    const ctx = newCtx();
    const span = ctx.enterMethod("Svc", "op", [parameterCapture("id", '"x"', false)]);
    const match = TRACEPARENT.exec(traceparentHeaders(ctx).traceparent ?? "");
    expect(match?.[1]).toBe(ctx.traceId());
    expect(match?.[2]).toBe(span);
  });
});

describe("tracedFetch", () => {
  test("sends the active span's traceparent to a real callee", async () => {
    const ctx = newCtx();
    const span = ctx.enterMethod("Svc", "op", []);
    await tracedFetch(ctx)(url());
    expect(received).toBe(`00-${ctx.traceId()}-${span}-01`);
  });

  test("sends no traceparent when no span is active", async () => {
    await tracedFetch(newCtx())(url());
    expect(received).toBeUndefined();
  });

  test("never overwrites a traceparent the caller set", async () => {
    const ctx = newCtx();
    ctx.enterMethod("Svc", "op", []);
    const explicit = `00-${"a".repeat(32)}-${"b".repeat(16)}-00`;
    await tracedFetch(ctx)(url(), { headers: { traceparent: explicit } });
    expect(received).toBe(explicit);
  });

  test("keeps the caller's other headers and a Request's own headers", async () => {
    const ctx = newCtx();
    ctx.enterMethod("Svc", "op", []);
    const seen: Array<string | undefined> = [];
    callee.on("request", (req) => seen.push(req.headers["x-k"] as string | undefined));
    await tracedFetch(ctx)(new Request(url(), { headers: { "x-k": "v" } }));
    expect(seen).toEqual(["v"]);
    expect(received).toMatch(TRACEPARENT);
  });
});
