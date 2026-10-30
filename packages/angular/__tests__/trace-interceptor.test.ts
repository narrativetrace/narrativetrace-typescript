// SPDX-License-Identifier: BUSL-1.1
// Licensed under the Business Source License 1.1 (see LICENSE); Change Date: four years from publication; Change License: Apache-2.0
// Copyright (c) 2026 Empower Agile
import { HttpClient, provideHttpClient, withInterceptors } from "@angular/common/http";
import { HttpTestingController, provideHttpClientTesting } from "@angular/common/http/testing";
import { TestBed } from "@angular/core/testing";
import { NarrativeTraceConfig, SyncNarrativeContext } from "@narrativetrace/core-web";
import { afterEach, beforeEach, describe, expect, test } from "vitest";
import { NARRATIVE_CONTEXT } from "../src/tokens.js";
import { traceInterceptor } from "../src/trace-interceptor.js";

describe("traceInterceptor", () => {
  let http: HttpClient;
  let httpMock: HttpTestingController;

  let ctx: SyncNarrativeContext;

  beforeEach(() => {
    ctx = new SyncNarrativeContext(new NarrativeTraceConfig("detail"));
    TestBed.configureTestingModule({
      providers: [
        { provide: NARRATIVE_CONTEXT, useValue: ctx },
        provideHttpClient(withInterceptors([traceInterceptor])),
        provideHttpClientTesting(),
      ],
    });
    http = TestBed.inject(HttpClient);
    httpMock = TestBed.inject(HttpTestingController);
  });

  afterEach(() => {
    httpMock.verify();
    TestBed.resetTestingModule();
  });

  test("adds traceparent header to request", () => {
    ctx.enterMethod("Page", "click", []);
    http.get("/api/test").subscribe();
    const req = httpMock.expectOne("/api/test");
    expect(req.request.headers.has("traceparent")).toBe(true);
    req.flush({});
  });

  test("traceparent is valid W3C format", () => {
    ctx.enterMethod("Page", "click", []);
    http.get("/api/test").subscribe();
    const req = httpMock.expectOne("/api/test");
    const traceparent = req.request.headers.get("traceparent") ?? "";
    expect(traceparent).toMatch(/^00-[0-9a-f]{32}-[0-9a-f]{16}-01$/);
    req.flush({});
  });

  test("preserves existing request headers", () => {
    ctx.enterMethod("Page", "click", []);
    http.get("/api/test", { headers: { Authorization: "Bearer token" } }).subscribe();
    const req = httpMock.expectOne("/api/test");
    expect(req.request.headers.get("Authorization")).toBe("Bearer token");
    expect(req.request.headers.has("traceparent")).toBe(true);
    req.flush({});
  });

  test("sends the open span's trace id and span id as the parent", () => {
    const spanId = ctx.enterMethod("Page", "click", []);
    http.get("/api/test").subscribe();
    const req = httpMock.expectOne("/api/test");
    expect(req.request.headers.get("traceparent")).toBe(`00-${ctx.traceId()}-${spanId}-01`);
    req.flush({});
  });

  test("sends no traceparent when no span is open", () => {
    http.get("/api/test").subscribe();
    const req = httpMock.expectOne("/api/test");
    expect(req.request.headers.has("traceparent")).toBe(false);
    req.flush({});
  });

  test("an untraced request between two interactions does not continue the first trace", () => {
    ctx.enterMethod("Page", "clickA", []);
    const traceA = ctx.traceId();
    ctx.exitMethodWithReturn("null");
    http.get("/api/test").subscribe();
    const req = httpMock.expectOne("/api/test");
    expect(req.request.headers.has("traceparent")).toBe(false);
    req.flush({});
    ctx.enterMethod("Page", "clickB", []);
    expect(ctx.traceId()).not.toBe(traceA);
  });

  test("a context that throws while naming the parent leaves the request untouched", () => {
    ctx.enterMethod("Page", "click", []);
    ctx.traceId = () => {
      throw new Error("context failed");
    };
    const bodies: unknown[] = [];
    http.get("/api/test").subscribe((b) => bodies.push(b));
    const req = httpMock.expectOne("/api/test");
    expect(req.request.headers.has("traceparent")).toBe(false);
    req.flush({ ok: true });
    expect(bodies).toEqual([{ ok: true }]);
  });
});
