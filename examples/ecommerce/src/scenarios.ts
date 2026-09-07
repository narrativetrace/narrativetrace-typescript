// SPDX-License-Identifier: BUSL-1.1
// Licensed under the Business Source License 1.1 (see LICENSE); Change Date: four years from publication; Change License: Apache-2.0
// Copyright (c) 2026 Empower Agile
import type { NarrativeContext, TraceTree } from "@narrativetrace/core-node";
import { ForkJoinGroup, renderIndentedText, renderProse } from "@narrativetrace/core-node";
import { renderMermaidSequence, renderPlantUmlSequence } from "@narrativetrace/diagrams";
import { traceObject } from "@narrativetrace/proxy";
import { InMemoryCatalogService } from "./catalog-service.js";
import { FlakyNotificationService } from "./flaky-notification-service.js";
import type { NotificationService } from "./notification-service.js";
import { StubNotificationService } from "./notification-service.js";
import { RemoteCatalogService } from "./remote-catalog-service.js";
import type { Scenario, ScenarioContext } from "./scenario.js";
import { createTracedNotificationService, createTracedServices } from "./traced-services.js";

/**
 * The six demo scenarios of the ecommerce example, in Java's order (`ECommerceExample`). Each
 * prints Java's sections — `--- Trace tree ---`, `--- Prose ---`, `--- Mermaid ---` — and records
 * its captured tree through `ScenarioContext.capture`. The launcher prints the title and the
 * wiring note; `demo.ts` iterates this list.
 */

type View = "prose" | "mermaid" | "plantuml";

const VIEWS: Record<View, { title: string; render: (tree: TraceTree) => string }> = {
  prose: { title: "Prose", render: renderProse },
  mermaid: { title: "Mermaid", render: renderMermaidSequence },
  plantuml: { title: "PlantUML", render: renderPlantUmlSequence },
};

function section(ctx: ScenarioContext, title: string, body: string): void {
  ctx.print(`\n--- ${title} ---\n`);
  ctx.print(body);
}

/** Captures the tree under the scenario title, then prints the tree and the requested views. */
function printCaptured(ctx: ScenarioContext, title: string, views: readonly View[]): TraceTree {
  const tree = ctx.context.captureTrace();
  ctx.capture(title, tree);
  section(ctx, "Trace tree", renderIndentedText(tree));
  for (const view of views) section(ctx, VIEWS[view].title, VIEWS[view].render(tree));
  return tree;
}

/** Runs a call whose failure is the point of the scenario; the trace records it either way. */
function expectFailure(call: () => unknown): void {
  try {
    call();
  } catch {
    // expected — the proxy already recorded the throw
  }
}

/** Compares prices concurrently: the fork/join twin of Java's worker-thread capture. */
class PriceComparison {
  constructor(private readonly context: NarrativeContext) {}

  async compare(productIds: readonly string[]): Promise<number[]> {
    const lookups = productIds.map(
      (productId) => (forked: NarrativeContext) =>
        tracedRemoteCatalog(forked).lookupPrice(productId),
    );
    return ForkJoinGroup.all(this.context, lookups);
  }
}

function tracedRemoteCatalog(context: NarrativeContext): RemoteCatalogService {
  return traceObject(new RemoteCatalogService(new InMemoryCatalogService()), context, undefined, {
    className: "RemoteCatalogService",
  });
}

function tracedCatalog(context: NarrativeContext): InMemoryCatalogService {
  return traceObject(new InMemoryCatalogService(), context, undefined, {
    className: "CatalogService",
  });
}

function tracedFlakyNotifications(context: NarrativeContext): NotificationService {
  const flaky = new FlakyNotificationService(new StubNotificationService(), 2);
  return traceObject(flaky, context, undefined, { className: "NotificationService" });
}

const successfulOrder: Scenario = {
  title: "Scenario 1: Successful Order + Async Notification",
  wiring:
    "Wiring: createTracedServices wraps each in-memory service in traceObject(impl, context) — an\n" +
    "ES Proxy — so DefaultOrderService holds no tracing code at all. Parameter names come from\n" +
    "@traced on each method, the narration on placeOrder from @narrated, and cardToken prints as\n" +
    "[REDACTED] because PaymentService.charge carries @notTraced(2). The awaited notification\n" +
    "lands in the same trace because AsyncNarrativeContext carries the active span across\n" +
    "await through AsyncLocalStorage.",
  run: async (ctx) => {
    const orders = createTracedServices(ctx.context);
    const notifications = createTracedNotificationService(ctx.context);
    const result = orders.placeOrder("C1", "P1", 2);
    await notifications.notifyOrderPlaced("C1", result.orderId);
    printCaptured(ctx, successfulOrder.title, ["prose", "mermaid"]);
  },
};

const paymentFailure: Scenario = {
  title: "Scenario 2: Payment Failure — Inventory Leak Bug",
  wiring:
    "Wiring: unchanged from scenario 1 — nothing was added to catch or log this failure. The\n" +
    "proxy records the thrown Error and unwinds the tree itself; the bracketed text after ✗\n" +
    "comes from @onError on PaymentService.charge.",
  run: async (ctx) => {
    const orders = createTracedServices(ctx.context);
    expectFailure(() => orders.placeOrder("C3", "P2", 3));
    const tree = ctx.context.captureTrace();
    ctx.capture(paymentFailure.title, tree);
    section(ctx, "Trace tree", renderIndentedText(tree));
    ctx.print(
      "\n  ^ Notice: InventoryService.reserve was called but InventoryService.release is missing from the trace.",
    );
    section(ctx, "Prose", renderProse(tree));
    section(ctx, "Mermaid", renderMermaidSequence(tree));
  },
};

const flakyService: Scenario = {
  title: "Scenario 3: Flaky External Service",
  wiring:
    "Wiring: no factory in this one — traceObject(new FlakyNotificationService(...), context)\n" +
    "wraps a plain object at the call site. Same NarrativeContext as the services above, so both\n" +
    "calls land in the same trace: decorators and a factory are conveniences, not requirements.",
  run: async (ctx) => {
    const notifications = tracedFlakyNotifications(ctx.context);
    await notifications.notifyOrderPlaced("C1", "ORD-1");
    expectFailure(() => notifications.notifyOrderPlaced("C1", "ORD-2"));
    printCaptured(ctx, flakyService.title, ["prose"]);
  },
};

const unknownCustomer: Scenario = {
  title: "Scenario 4: Unknown Customer",
  wiring:
    "Wiring: unchanged — the same proxies produced these lines. @onError on\n" +
    "CustomerService.findCustomer supplies the bracketed message; the order stops at the first\n" +
    "call, so nothing was reserved and nothing needs releasing.",
  run: async (ctx) => {
    const orders = createTracedServices(ctx.context);
    expectFailure(() => orders.placeOrder("C-UNKNOWN", "P1", 1));
    printCaptured(ctx, unknownCustomer.title, ["prose"]);
  },
};

const outOfStock: Scenario = {
  title: "Scenario 5: Out of Stock",
  wiring:
    "Wiring: same proxies; @onError on InventoryService.reserve supplies the bracketed message.\n" +
    "The PlantUML below is that same captured tree handed to renderPlantUmlSequence — not a\n" +
    "re-run.",
  run: async (ctx) => {
    const orders = createTracedServices(ctx.context);
    expectFailure(() => orders.placeOrder("C1", "P3", 9999));
    printCaptured(ctx, outOfStock.title, ["prose", "plantuml"]);
  },
};

const explicitAsync: Scenario = {
  title: "Scenario 6: Explicit Async Trace Capture",
  wiring:
    "Wiring: ForkJoinGroup.all(context, tasks) runs the remote lookups concurrently, each in a\n" +
    "forked context that inherits the parent's trace identity, and joins them into one ⑂ segment\n" +
    "with the group's wall time — the AsyncLocalStorage twin of Java's worker-thread capture.\n" +
    "RemoteCatalogService awaits a simulated round trip, so the fork is real concurrency.",
  run: async (ctx) => {
    ctx.print("  Traces are per context: captureTrace() returns this context's story.");
    ctx.print("  The fork below is concurrent work joined back into the same tree.\n");
    tracedCatalog(ctx.context).lookupPrice("P1");
    const comparison = traceObject(new PriceComparison(ctx.context), ctx.context, {
      compare: ["productIds"],
    });
    await comparison.compare(["P2", "P3"]);
    printCaptured(ctx, explicitAsync.title, []);
  },
};

export const scenarios: readonly Scenario[] = [
  successfulOrder,
  paymentFailure,
  flakyService,
  unknownCustomer,
  outOfStock,
  explicitAsync,
];
