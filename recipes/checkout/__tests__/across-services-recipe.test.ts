// SPDX-License-Identifier: BUSL-1.1
// Licensed under the Business Source License 1.1 (see LICENSE); Change Date: four years from publication; Change License: Apache-2.0
// Copyright (c) 2026 Empower Agile
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import {
  type AsyncNarrativeContext,
  parseTraceparent,
  renderMarkdownBody,
  renderStructuralDocument,
  type TraceNode,
} from "@narrativetrace/core-node";
import { traceObject } from "@narrativetrace/proxy";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { HttpPaymentService } from "../src/http-payment-service.js";
import { InMemoryInventory } from "../src/inventory.js";
import { InMemoryOrderRepository } from "../src/orders.js";
import { DECLINING_CARD } from "../src/payments.js";
import { DefaultRemoteOrderService, type RemoteOrderService } from "../src/remote-order-service.js";
import { PaymentServiceProcess } from "../support/payment-service-process.js";
import { recipeOutput } from "../support/recipe-runs.js";
import { serviceContextLoggingTo } from "../support/service-log.js";
import { useStableSpanIds } from "../support/stable-ids.js";

/**
 * Proves documentation/recipes/follow-one-request-across-services.md: the checkout charges a card
 * through a second service over HTTP, the W3C `traceparent` goes with the request, and the callee's
 * own trace carries the caller's trace id (release rule 8, docs as tests).
 *
 * @llmNote The callee's narrative is rendered here, not by the Vitest fixture: the fixture writes
 * the trace of the context it manages, and the point of this page is that the second service has a
 * context — and a narrative — of its own. The caller's `.nt` is embedded rather than its Markdown:
 * the HTTP round trip is the one span whose duration can cross the renderer's 200 ms "slow" marker
 * on a loaded host, and the structural trace carries no durations at all.
 */
const SLUG = "follow-one-request-across-services";
const LOG_FILE = recipeOutput(SLUG, "checkout.log");
const DEMO_TRACEPARENT = "00-c4e1d0a7c4e1d0a7c4e1d0a7c4e1d0a7-c4e1d0a7c4e1d0a7-01";
const DEMO_TRACE = parseTraceparent(DEMO_TRACEPARENT);
const DEMO_TRACE_ID = DEMO_TRACE?.traceId;

let paymentService: PaymentServiceProcess;
let context: AsyncNarrativeContext;
let stock: InMemoryInventory;
let repository: InMemoryOrderRepository;
let checkout: RemoteOrderService;
let endpoint: string;

/** The checkout, with the HTTP payment client where the local one used to be. */
function checkoutCalling(endpoint: string): RemoteOrderService {
  const inventory = traceObject(
    stock,
    context,
    { reserve: ["sku", "quantity"], release: ["sku", "quantity"] },
    { className: "InventoryService" },
  );
  const payments = traceObject(
    new HttpPaymentService(context, endpoint),
    context,
    { charge: ["customerId", "amountCents", "card"] },
    { className: "PaymentService" },
  );
  const orders = traceObject(
    repository,
    context,
    { save: ["order"] },
    { className: "OrderRepository" },
  );
  return traceObject(
    new DefaultRemoteOrderService(inventory, payments, orders),
    context,
    { placeOrder: ["customerId", "sku", "quantity", "cardNumber"] },
    { className: "OrderService" },
  );
}

async function startServices(logFile: string): Promise<void> {
  context = serviceContextLoggingTo(logFile, { serviceName: "checkout", fresh: true });
  paymentService = new PaymentServiceProcess(logFile);
  stock = new InMemoryInventory("SKU-KB", 5);
  repository = new InMemoryOrderRepository();
  endpoint = await paymentService.start();
  checkout = checkoutCalling(endpoint);
}

function child(parent: TraceNode, methodName: string): TraceNode {
  const found = parent.children.find((node) => node.signature.methodName === methodName);
  if (found === undefined) throw new Error(`no ${methodName} under ${parent.signature.methodName}`);
  return found;
}

beforeEach(useStableSpanIds);

afterEach(async () => {
  await paymentService.stop();
});

describe("follow one request across services", () => {
  it("the payment service continues the trace the checkout sent", async () => {
    await startServices(LOG_FILE);
    const caller = await context.run(async () => {
      const orderId = await checkout.placeOrder("C-1234", "SKU-KB", 2, "4242424242424242");
      expect(orderId).toBe("ORD-C-1234-SKU-KB-2");
      return context.captureTrace();
    }, DEMO_TRACE);

    expect(stock.availableUnits("SKU-KB")).toBe(3);
    expect(repository.saved()).toHaveLength(1);
    writeBothNarratives(caller);
    assertTheTraceCrossedTheWire(caller.roots[0] as TraceNode);
  });

  it("a request sent outside any span carries no traceparent", async () => {
    await startServices(recipeOutput(SLUG, "untraced.log"));
    const payments = new HttpPaymentService(context, endpoint);

    await context.run(() => payments.charge("C-1234", 7998, "4242424242424242"), DEMO_TRACE);

    expect(paymentService.lastServed().traceparent).toBeUndefined();
  });
});

describe("follow one request across services, declined", () => {
  it("a declined card crosses the wire as an error and the stock is released", async () => {
    await startServices(recipeOutput(SLUG, "declined.log"));
    const attempt = context.run(
      () => checkout.placeOrder("C-1234", "SKU-KB", 2, DECLINING_CARD),
      DEMO_TRACE,
    );

    await expect(attempt).rejects.toThrow("card declined by the issuer");
    expect(stock.availableUnits("SKU-KB")).toBe(5);
    expect(repository.saved()).toHaveLength(0);
    expect(paymentService.lastServed().trace.roots[0]?.outcome.kind).toBe("threw");
  });
});

/**
 * One trace id in both services, and the parent the header named is the caller's own `charge` span.
 * The callee adopts the trace id and records the sent parent span as its root's parent.
 */
function assertTheTraceCrossedTheWire(placeOrder: TraceNode): void {
  const served = paymentService.lastServed();
  expect(parseTraceparent(served.traceparent)?.traceId).toBe(DEMO_TRACE_ID);
  const sentParent = (served.traceparent as string).split("-")[2];
  const callerCharge = child(placeOrder, "charge");
  expect(callerCharge.spanContext?.spanId).toBe(sentParent);

  const calleeRoot = served.trace.roots[0] as TraceNode;
  expect(calleeRoot.signature.methodName).toBe("charge");
  expect(calleeRoot.spanContext?.traceId).toBe(DEMO_TRACE_ID);
  expect(calleeRoot.spanContext?.parentSpanId).toBe(sentParent);
  expect(readFileSync(LOG_FILE, "utf-8")).toContain('"service.name":"payment-service"');
}

/** The caller's value-free `.nt` and the callee's own narrative, into the directory the page embeds. */
function writeBothNarratives(caller: Parameters<typeof renderStructuralDocument>[0]): void {
  mkdirSync(recipeOutput(SLUG), { recursive: true });
  writeFileSync(
    join(recipeOutput(SLUG), "checkout.nt"),
    `${renderStructuralDocument(caller, "a customer checks out against the payment service")}\n`,
  );
  writeFileSync(
    join(recipeOutput(SLUG), "payment-service.md"),
    `${renderMarkdownBody(paymentService.lastServed().trace)}\n`,
  );
}
