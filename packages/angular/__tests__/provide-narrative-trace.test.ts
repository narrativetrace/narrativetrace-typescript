// SPDX-License-Identifier: BUSL-1.1
// Licensed under the Business Source License 1.1 (see LICENSE); Change Date: four years from publication; Change License: Apache-2.0
// Copyright (c) 2026 Empower Agile
import { HttpClient } from "@angular/common/http";
import { HttpTestingController, provideHttpClientTesting } from "@angular/common/http/testing";
import { TestBed } from "@angular/core/testing";
import type { NarrativeContext } from "@narrativetrace/core-web";
import { afterEach, beforeEach, describe, expect, test } from "vitest";
import { provideNarrativeTrace } from "../src/provide-narrative-trace.js";
import { NARRATIVE_CONTEXT } from "../src/tokens.js";

describe("provideNarrativeTrace", () => {
  let http: HttpClient;
  let httpMock: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [provideNarrativeTrace(), provideHttpClientTesting()],
    });
    http = TestBed.inject(HttpClient);
    httpMock = TestBed.inject(HttpTestingController);
  });

  afterEach(() => {
    httpMock.verify();
    TestBed.resetTestingModule();
  });

  test("NARRATIVE_CONTEXT is injectable", () => {
    const ctx = TestBed.inject(NARRATIVE_CONTEXT);
    expect(ctx).toBeDefined();
    expect(ctx.isActive).toBe(true);
  });

  test("HTTP requests include traceparent header", () => {
    http.get("/api/test").subscribe();
    const req = httpMock.expectOne("/api/test");
    expect(req.request.headers.has("traceparent")).toBe(true);
    expect(req.request.headers.get("traceparent")).toMatch(/^00-[0-9a-f]{32}-[0-9a-f]{16}-01$/);
    req.flush({});
  });

  test("injected context produces valid traceId", () => {
    const ctx = TestBed.inject(NARRATIVE_CONTEXT) as NarrativeContext;
    const traceId = ctx.traceId();
    expect(traceId).toMatch(/^[0-9a-f]{32}$/);
  });
});
