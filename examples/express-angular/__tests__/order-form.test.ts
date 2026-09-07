// SPDX-License-Identifier: BUSL-1.1
// Licensed under the Business Source License 1.1 (see LICENSE); Change Date: four years from publication; Change License: Apache-2.0
// Copyright (c) 2026 Empower Agile
import { HttpTestingController, provideHttpClientTesting } from "@angular/common/http/testing";
import { type ComponentFixture, TestBed } from "@angular/core/testing";
import { provideNarrativeTrace, provideTraced } from "@narrativetrace/angular";
import { afterEach, beforeEach, describe, expect, test } from "vitest";
import { OrderService } from "../client/order.service.js";
import { OrderFormComponent } from "../client/order-form.component.js";

describe("OrderFormComponent", () => {
  let fixture: ComponentFixture<OrderFormComponent>;
  let component: OrderFormComponent;
  let httpMock: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({
      imports: [OrderFormComponent],
      providers: [provideNarrativeTrace(), provideTraced(OrderService), provideHttpClientTesting()],
    });
    fixture = TestBed.createComponent(OrderFormComponent);
    component = fixture.componentInstance;
    httpMock = TestBed.inject(HttpTestingController);
    fixture.detectChanges();
  });

  afterEach(() => {
    httpMock.verify();
    TestBed.resetTestingModule();
  });

  test("renders form with customer and product dropdowns", () => {
    const el = fixture.nativeElement as HTMLElement;
    const selects = el.querySelectorAll("select");
    expect(selects.length).toBe(2);
    const button = el.querySelector("button");
    expect(button?.textContent).toContain("Place Order");
  });

  test("submit triggers POST /api/orders", () => {
    const form = fixture.nativeElement.querySelector("form") as HTMLFormElement;
    form.dispatchEvent(new Event("submit"));
    fixture.detectChanges();

    const req = httpMock.expectOne("/api/orders");
    expect(req.request.method).toBe("POST");
    expect(req.request.body.customerId).toBe("C1");
    req.flush({
      order: { orderId: "ORD-1", transactionId: "TX-1", totalCharged: 29.99, itemCount: 1 },
      trace: { roots: [] },
    });
  });

  test("successful response displays order result", () => {
    const form = fixture.nativeElement.querySelector("form") as HTMLFormElement;
    form.dispatchEvent(new Event("submit"));
    fixture.detectChanges();

    const req = httpMock.expectOne("/api/orders");
    req.flush({
      order: { orderId: "ORD-1", transactionId: "TX-1", totalCharged: 29.99, itemCount: 1 },
      trace: { roots: [] },
    });
    fixture.detectChanges();

    expect(component.orderResult()).toBeDefined();
    expect(component.orderResult()?.orderId).toBe("ORD-1");
  });

  test("successful response captures client trace", () => {
    const form = fixture.nativeElement.querySelector("form") as HTMLFormElement;
    form.dispatchEvent(new Event("submit"));
    fixture.detectChanges();

    const req = httpMock.expectOne("/api/orders");
    req.flush({
      order: { orderId: "ORD-1", transactionId: "TX-1", totalCharged: 29.99, itemCount: 1 },
      trace: { roots: [] },
    });
    fixture.detectChanges();

    expect(component.clientTraceText()).toBeDefined();
    expect(component.clientTraceText()!.length).toBeGreaterThan(0);
  });

  test("error response displays error message", () => {
    const form = fixture.nativeElement.querySelector("form") as HTMLFormElement;
    form.dispatchEvent(new Event("submit"));
    fixture.detectChanges();

    const req = httpMock.expectOne("/api/orders");
    req.flush(
      { error: "Payment declined for customer: C3", trace: { roots: [] } },
      { status: 400, statusText: "Bad Request" },
    );
    fixture.detectChanges();

    expect(component.errorMessage()).toBe("Payment declined for customer: C3");
  });

  test("trace ID is displayed after submit", () => {
    const form = fixture.nativeElement.querySelector("form") as HTMLFormElement;
    form.dispatchEvent(new Event("submit"));
    fixture.detectChanges();

    expect(component.traceId()).toMatch(/^[0-9a-f]{32}$/);

    const req = httpMock.expectOne("/api/orders");
    req.flush({
      order: { orderId: "ORD-1", transactionId: "TX-1", totalCharged: 29.99, itemCount: 1 },
      trace: { roots: [] },
    });
  });
});
