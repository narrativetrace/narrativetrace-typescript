// SPDX-License-Identifier: BUSL-1.1
// Licensed under the Business Source License 1.1 (see LICENSE); Change Date: four years from publication; Change License: Apache-2.0
// Copyright (c) 2026 Empower Agile
import { HttpTestingController, provideHttpClientTesting } from "@angular/common/http/testing";
import { TestBed } from "@angular/core/testing";
import {
  NARRATIVE_CONTEXT,
  provideNarrativeTrace,
  provideTraced,
  TraceCaptureService,
} from "@narrativetrace/angular";
import { afterEach, beforeEach, describe, expect, test } from "vitest";
import { OrderService } from "../client/order.service.js";

describe("OrderService with provideTraced", () => {
  let service: OrderService;
  let httpMock: HttpTestingController;
  let traceCapture: TraceCaptureService;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [provideNarrativeTrace(), provideTraced(OrderService), provideHttpClientTesting()],
    });
    service = TestBed.inject(OrderService);
    httpMock = TestBed.inject(HttpTestingController);
    traceCapture = TestBed.inject(TraceCaptureService);
  });

  afterEach(() => {
    httpMock.verify();
    TestBed.resetTestingModule();
  });

  test("placeOrder sends POST /api/orders with correct body", () => {
    const request = { customerId: "C1", productId: "P1", quantity: 2 };
    service.placeOrder(request).subscribe();

    const req = httpMock.expectOne("/api/orders");
    expect(req.request.method).toBe("POST");
    expect(req.request.body).toEqual(request);
    req.flush({ order: { orderId: "ORD-1" }, trace: { roots: [] } });
  });

  test("provideTraced captures OrderService.placeOrder in trace", () => {
    service.placeOrder({ customerId: "C1", productId: "P1", quantity: 1 }).subscribe();

    const req = httpMock.expectOne("/api/orders");
    req.flush({ order: { orderId: "ORD-1" }, trace: { roots: [] } });

    const trace = traceCapture.captureAndReset();
    expect(trace.roots).toHaveLength(1);
    expect(trace.roots[0]?.signature.className).toBe("OrderService");
    expect(trace.roots[0]?.signature.methodName).toBe("placeOrder");
  });

  test("traceInterceptor adds traceparent header to outgoing request", () => {
    service.placeOrder({ customerId: "C1", productId: "P1", quantity: 1 }).subscribe();

    const req = httpMock.expectOne("/api/orders");
    expect(req.request.headers.has("traceparent")).toBe(true);
    expect(req.request.headers.get("traceparent")).toMatch(/^00-[0-9a-f]{32}-[0-9a-f]{16}-01$/);
    req.flush({ order: { orderId: "ORD-1" }, trace: { roots: [] } });
  });

  test("traceparent traceId matches context traceId", () => {
    const ctx = TestBed.inject(NARRATIVE_CONTEXT);
    service.placeOrder({ customerId: "C1", productId: "P1", quantity: 1 }).subscribe();

    const req = httpMock.expectOne("/api/orders");
    const traceparent = req.request.headers.get("traceparent")!;
    const traceId = traceparent.split("-")[1];
    expect(traceId).toBe(ctx.traceId());
    req.flush({ order: { orderId: "ORD-1" }, trace: { roots: [] } });
  });
});
