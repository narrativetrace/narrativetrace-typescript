// SPDX-License-Identifier: BUSL-1.1
// Licensed under the Business Source License 1.1 (see LICENSE); Change Date: four years from publication; Change License: Apache-2.0
// Copyright (c) 2026 Empower Agile
import { HttpClient } from "@angular/common/http";
import { HttpTestingController, provideHttpClientTesting } from "@angular/common/http/testing";
import { Injectable, inject } from "@angular/core";
import { TestBed } from "@angular/core/testing";
import type { NarrativeContext, TraceNode } from "@narrativetrace/core";
import { BehaviorSubject, defer, map, type Observable, throwError } from "rxjs";
import { afterEach, beforeEach, describe, expect, test } from "vitest";
import { NARRATIVE_CONTEXT, provideNarrativeTrace, provideTraced } from "../src/index.js";

@Injectable()
class OrderApi {
  private readonly http = inject(HttpClient);
  readonly status = new BehaviorSubject<string>("idle");

  place(orderId: string): Observable<unknown> {
    return this.http.post("/api/orders", { orderId });
  }

  placeAndRead(orderId: string): Observable<string> {
    return this.http
      .post<{ orderId: string }>("/api/orders", { orderId })
      .pipe(map((r) => r.orderId));
  }

  refuse(): Observable<unknown> {
    return throwError(() => new Error("refused"));
  }

  statusStream(): BehaviorSubject<string> {
    return this.status;
  }

  label(): string {
    return "orders";
  }

  nothing(): null {
    return null;
  }

  shapeshifter(): object {
    return new Proxy(
      {},
      {
        getPrototypeOf() {
          throw new Error("no prototype for you");
        },
      },
    );
  }
}

@Injectable()
class Audit {
  private readonly http = inject(HttpClient);

  record(): Observable<unknown> {
    return this.http.post("/api/audit", {});
  }
}

@Injectable()
class CheckoutPage {
  private readonly api = inject(OrderApi);
  private readonly audit = inject(Audit);

  submit(): void {
    this.api.place("o1").subscribe();
  }

  submitAudited(): Observable<unknown> {
    return defer(() => this.audit.record());
  }
}

function traceparentOf(node: TraceNode): string {
  return `00-${node.spanContext?.traceId}-${node.spanContext?.spanId}-01`;
}

describe("a request sent lazily by a traced method's Observable", () => {
  let api: OrderApi;
  let page: CheckoutPage;
  let http: HttpClient;
  let httpMock: HttpTestingController;
  let ctx: NarrativeContext;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [
        provideNarrativeTrace(),
        provideHttpClientTesting(),
        provideTraced(OrderApi),
        provideTraced(Audit),
        provideTraced(CheckoutPage),
      ],
    });
    api = TestBed.inject(OrderApi);
    page = TestBed.inject(CheckoutPage);
    http = TestBed.inject(HttpClient);
    httpMock = TestBed.inject(HttpTestingController);
    ctx = TestBed.inject(NARRATIVE_CONTEXT);
  });

  afterEach(() => {
    httpMock.verify();
    TestBed.resetTestingModule();
  });

  test("carries a traceparent naming the traced method's trace and span", () => {
    api.place("o1").subscribe();

    const req = httpMock.expectOne("/api/orders");
    const root = ctx.captureTrace().roots[0] as TraceNode;
    expect(root.signature.methodName).toBe("place");
    expect(req.request.headers.get("traceparent")).toBe(traceparentOf(root));
    req.flush({});
  });

  test("an operator chain on the request keeps the header and the emitted value", () => {
    const seen: string[] = [];
    api.placeAndRead("o7").subscribe((id) => seen.push(id));

    const req = httpMock.expectOne("/api/orders");
    const root = ctx.captureTrace().roots[0] as TraceNode;
    expect(req.request.headers.get("traceparent")).toBe(traceparentOf(root));
    req.flush({ orderId: "o7" });
    expect(seen).toEqual(["o7"]);
  });

  test("a request with no traced method behind it carries no traceparent", () => {
    api.place("o1");
    http.get("/api/untraced").subscribe();

    const req = httpMock.expectOne("/api/untraced");
    expect(req.request.headers.has("traceparent")).toBe(false);
    req.flush({});
  });

  test("a request sent after a traced Observable's subscription carries no traceparent", () => {
    api.place("o1").subscribe();
    http.get("/api/untraced").subscribe();

    httpMock.expectOne("/api/orders").flush({});
    const req = httpMock.expectOne("/api/untraced");
    expect(req.request.headers.has("traceparent")).toBe(false);
    req.flush({});
  });

  test("a never-subscribed Observable leaves no span open and sends nothing", () => {
    api.place("o1");

    expect(ctx.activeSpanId).toBeNull();
    const root = ctx.captureTrace().roots[0] as TraceNode;
    expect(root.outcome.kind).toBe("returned");
    httpMock.expectNone("/api/orders");
  });

  test("a pending request holds no span open while it waits for its response", () => {
    api.place("o1").subscribe();

    expect(ctx.activeSpanId).toBeNull();
    expect(ctx.captureTrace().roots[0]?.outcome.kind).toBe("returned");
    httpMock.expectOne("/api/orders").flush({});
  });

  test("subscribing twice sends two requests, both parented to the one method span", () => {
    const orders = api.place("o1");
    orders.subscribe();
    orders.subscribe();

    const reqs = httpMock.match("/api/orders");
    const roots = ctx.captureTrace().roots;
    expect(roots).toHaveLength(1);
    const expected = traceparentOf(roots[0] as TraceNode);
    expect(reqs.map((r) => r.request.headers.get("traceparent"))).toEqual([expected, expected]);
    for (const r of reqs) r.flush({});
  });

  test("a traced caller subscribing inside its own span names the method that made the request", () => {
    page.submit();

    const req = httpMock.expectOne("/api/orders");
    const submit = ctx.captureTrace().roots[0] as TraceNode;
    const place = submit.children[0] as TraceNode;
    expect(place.signature.methodName).toBe("place");
    expect(req.request.headers.get("traceparent")).toBe(traceparentOf(place));
    req.flush({});
  });

  test("a traced method called during the subscription names its own span, not the outer one", () => {
    page.submitAudited().subscribe();

    const req = httpMock.expectOne("/api/audit");
    const roots = ctx.captureTrace().roots;
    const record = roots.find((r) => r.signature.methodName === "record") as TraceNode;
    expect(req.request.headers.get("traceparent")).toBe(traceparentOf(record));
    req.flush({});
  });

  test("an error the Observable emits reaches the subscriber unchanged", () => {
    const errors: unknown[] = [];
    api.refuse().subscribe({ error: (e: Error) => errors.push(e.message) });

    expect(errors).toEqual(["refused"]);
  });

  test("a Subject the method returns comes back as the same Subject", () => {
    expect(api.statusStream()).toBe(api.status);
  });

  test("a result that is not an Observable comes back exactly as the method returned it", () => {
    expect(api.label()).toBe("orders");
    expect(api.nothing()).toBeNull();
  });

  test("a result whose prototype cannot be read comes back untouched", () => {
    const hostile = api.shapeshifter();
    expect(() => Object.getPrototypeOf(hostile)).toThrow("no prototype for you");
  });

  test("a context that throws while reporting its open span leaves results and requests untouched", () => {
    Object.defineProperty(ctx, "activeSpanId", {
      get() {
        throw new Error("context failed");
      },
    });
    const seen: unknown[] = [];
    api.place("o1").subscribe((b) => seen.push(b));

    const req = httpMock.expectOne("/api/orders");
    expect(req.request.headers.has("traceparent")).toBe(false);
    req.flush({ ok: true });
    expect(seen).toEqual([{ ok: true }]);
  });
});
