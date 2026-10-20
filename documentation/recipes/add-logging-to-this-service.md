# Add logging to this service

## The problem

> Add logging to this service.

The service is a checkout. It reserves stock, charges a card and saves an
order, and it contains no log statement at all:

<!-- snippet: recipes/checkout/src/order-service.ts -->
```ts
// src/order-service.ts
import type { InventoryService } from "./inventory.js";
import type { Order, OrderRepository } from "./orders.js";
import { PaymentDeclinedError, type PaymentService } from "./payments.js";

const UNIT_PRICE_CENTS = 3999;

/** Places an order and returns its id. */
export interface OrderService {
  placeOrder(customerId: string, sku: string, quantity: number, cardNumber: string): string;
}

/** The checkout: reserve the stock, charge the card, save the order — and release on a decline. */
export class DefaultOrderService implements OrderService {
  constructor(
    private readonly inventory: InventoryService,
    private readonly payments: PaymentService,
    private readonly orders: OrderRepository,
  ) {}

  placeOrder(customerId: string, sku: string, quantity: number, cardNumber: string): string {
    this.inventory.reserve(sku, quantity);
    const amountCents = UNIT_PRICE_CENTS * quantity;
    try {
      this.payments.charge(customerId, amountCents, cardNumber);
    } catch (error) {
      if (error instanceof PaymentDeclinedError) {
        this.inventory.release(sku, quantity);
      }
      throw error;
    }
    const orderId = `ORD-${customerId}-${sku}-${quantity}`;
    const order: Order = { orderId, customerId, sku, quantity, amountCents };
    this.orders.save(order);
    return orderId;
  }
}
```
<!-- /snippet -->

What you actually want is the thing logging is a means to: what this call
did, with the values it did it with, in the log your team already reads. So
the answer below writes no log statement either.

## Minimal setup

Beyond the [install](../installation-guide.md) — `@narrativetrace/core-node`
and `@narrativetrace/proxy` — this page needs the bridge to the logger you
already run, and that logger's own package:

```bash
npm add @narrativetrace/pino @narrativetrace/observability pino
```

([`@narrativetrace/winston`](../framework-integration-guide.md#9-winston--pino)
works the same way if Winston is your logger.) The bridge is the one place the
logger appears. It is an event consumer, and the context hands every event to
it as well as to the buffer `captureTrace()` reads — nothing in the checkout,
and nothing around its calls, mentions it:

<!-- snippet: recipes/checkout/support/log-context.ts -->
```ts
// support/log-context.ts
import { mkdirSync, rmSync } from "node:fs";
import { dirname } from "node:path";
import {
  BufferedEventConsumer,
  DualPathPipeline,
  NarrativeTraceConfig,
  parseTraceparent,
  SyncNarrativeContext,
} from "@narrativetrace/core-node";
import { createPinoEventConsumer } from "@narrativetrace/pino";
import pino from "pino";

/** A fixed W3C traceparent, adopted so the embedded output names the same trace every run. */
const DEMO_TRACEPARENT = "00-c4e1d0a7c4e1d0a7c4e1d0a7c4e1d0a7-c4e1d0a7c4e1d0a7-01";

/** Any pino instance works; this one writes to a fresh file and drops the per-run fields. */
function loggerWritingTo(logFile: string): pino.Logger {
  mkdirSync(dirname(logFile), { recursive: true });
  rmSync(logFile, { force: true });
  const destination = pino.destination({ dest: logFile, sync: true });
  return pino({ level: "trace", base: null, timestamp: false }, destination);
}

/**
 * A context whose events reach the project's own pino logger (as well as the in-memory buffer
 * `captureTrace()` reads), for a trace id fixed by an adopted `traceparent`.
 */
export function contextLoggingTo(logFile: string): SyncNarrativeContext {
  const consumer = createPinoEventConsumer(loggerWritingTo(logFile));
  const pipeline = new DualPathPipeline(consumer, new BufferedEventConsumer());
  return new SyncNarrativeContext(
    new NarrativeTraceConfig(),
    undefined,
    pipeline,
    null,
    undefined,
    parseTraceparent(DEMO_TRACEPARENT)?.traceId,
  );
}
```
<!-- /snippet -->

`trace` is the level the bridge writes entries and returns at by default, so
the logger has to be listening there. `base: null` and `timestamp: false` only
drop the process id, the host name and the clock from every line, because
this page embeds a real run's log file byte-for-byte and those would differ on
every run — put them back in your own project, nothing else changes.

## The scenario

Each collaborator is wrapped once, where it is constructed — the checkout
itself last, so calls through it are captured before they reach the real
implementation. JavaScript keeps neither parameter names nor interfaces at
runtime, so the wrap says both: the names each method's parameters have, and
the interface name each call should be recorded under. Nothing else changes:

<!-- snippet: recipes/checkout/support/wiring.ts -->
```ts
// support/wiring.ts
import type { NarrativeContext } from "@narrativetrace/core-node";
import { traceObject } from "@narrativetrace/proxy";
import { InMemoryInventory, type InventoryService } from "../src/inventory.js";
import { DefaultOrderService, type OrderService } from "../src/order-service.js";
import { InMemoryOrderRepository, type OrderRepository } from "../src/orders.js";
import { CardPaymentService, type PaymentService } from "../src/payments.js";

/** The three collaborators a checkout is built from, as the scenario's tests hand them over. */
export interface Collaborators {
  readonly inventory: InventoryService;
  readonly payments: PaymentService;
  readonly orders: OrderRepository;
}

/** Builds the checkout under test from the (already traced) collaborators. */
export type CheckoutFactory = (collaborators: Collaborators) => OrderService;

/** What a scenario reads back: the traced checkout, and the real stock and repository behind it. */
export interface TracedCheckout {
  readonly checkout: OrderService;
  readonly stock: InMemoryInventory;
  readonly repository: InMemoryOrderRepository;
}

const defaultCheckout: CheckoutFactory = ({ inventory, payments, orders }) =>
  new DefaultOrderService(inventory, payments, orders);

/**
 * The checkout every recipe runs, wired the way the first recipe wires it: each collaborator
 * wrapped once where it is constructed, the checkout itself last. The class names are the
 * interfaces' — a trace names what a caller depends on, so two implementations of one interface
 * render as the same call and one approved baseline compares across them.
 */
export function tracedCheckout(
  context: NarrativeContext,
  makeCheckout: CheckoutFactory = defaultCheckout,
): TracedCheckout {
  const stock = new InMemoryInventory("SKU-KB", 5);
  const repository = new InMemoryOrderRepository();
  const inventory = traceObject(
    stock,
    context,
    { reserve: ["sku", "quantity"], release: ["sku", "quantity"] },
    { className: "InventoryService" },
  );
  const payments = traceObject(
    new CardPaymentService(),
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
  const checkout = traceObject(
    makeCheckout({ inventory, payments, orders }),
    context,
    { placeOrder: ["customerId", "sku", "quantity", "cardNumber"] },
    { className: "OrderService" },
  );
  return { checkout, stock, repository };
}
```
<!-- /snippet -->

The test that runs it is an ordinary Vitest test, because that is where a flow
like this is already exercised; the same wiring works in a plain script or an
Express handler:

<!-- snippet: recipes/checkout/__tests__/add-logging-recipe.test.ts -->
```ts
// __tests__/add-logging-recipe.test.ts
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { beforeAll, expect, it } from "vitest";
import { contextLoggingTo } from "../support/log-context.js";
import { useStableSpanIds } from "../support/stable-ids.js";
import { tracedCheckout } from "../support/wiring.js";

/**
 * Proves documentation/recipes/add-logging-to-this-service.md: the checkout, with no log statement
 * anywhere in it, logs every call through the project's own pino logger once its collaborators are
 * wrapped. The page's output block is the file pino writes, not a rendering this test produces.
 */
const LOG_FILE = join(
  "narrativetrace-output",
  "recipes",
  "add-logging-to-this-service",
  "checkout.log",
);

beforeAll(useStableSpanIds);

it("a customer checks out", () => {
  const context = contextLoggingTo(LOG_FILE);
  const { checkout, stock, repository } = tracedCheckout(context);

  const orderId = checkout.placeOrder("C-1234", "SKU-KB", 2, "4242424242424242");

  expect(orderId).toBe("ORD-C-1234-SKU-KB-2");
  expect(stock.availableUnits("SKU-KB")).toBe(3);
  expect(repository.saved()).toHaveLength(1);
  expect(readFileSync(LOG_FILE, "utf-8")).toContain("→ OrderService.placeOrder");
});
```
<!-- /snippet -->

`useStableSpanIds` and the adopted `traceparent` are what keep this page's
output the same on every run: a real run mints random span ids and, unless an
inbound request's `traceparent` header says otherwise, a random trace id. Both
are scaffolding for the page, not part of the answer.

## The actual output

The log the run above wrote, through the project's own logger — one JSON
object per event, exactly as pino wrote it:

<!-- snippet: recipes/checkout/narrativetrace-output/recipes/add-logging-to-this-service/checkout.log -->
```text
{"level":10,"code.namespace":"OrderService","code.function":"placeOrder","nt.depth":0,"nt.parameters":[{"name":"customerId","value":"\"C-1234\""},{"name":"sku","value":"\"SKU-KB\""},{"name":"quantity","value":"2"},{"name":"cardNumber","value":"[REDACTED]"}],"trace_id":"c4e1d0a7c4e1d0a7c4e1d0a7c4e1d0a7","nt.traceName":"solid wand romps","span_id":"0000000000000001","nt.storyId":"OrderService.placeOrder","nt.chapterId":"OrderService.placeOrder","nt.entryType":"entry","nt.eventType":"method_enter","nt.schemaVersion":"1.0","msg":"→ OrderService.placeOrder"}
{"level":10,"code.namespace":"InventoryService","code.function":"reserve","nt.depth":1,"nt.parameters":[{"name":"sku","value":"\"SKU-KB\""},{"name":"quantity","value":"2"}],"trace_id":"c4e1d0a7c4e1d0a7c4e1d0a7c4e1d0a7","nt.traceName":"solid wand romps","span_id":"0000000000000002","parent_span_id":"0000000000000001","nt.storyId":"OrderService.placeOrder","nt.chapterId":"OrderService.placeOrder","nt.entryType":"entry","nt.eventType":"method_enter","nt.schemaVersion":"1.0","msg":"→ InventoryService.reserve"}
{"level":10,"nt.outcome":"returned","nt.depth":0,"trace_id":"c4e1d0a7c4e1d0a7c4e1d0a7c4e1d0a7","nt.traceName":"solid wand romps","span_id":"0000000000000002","parent_span_id":"0000000000000001","nt.storyId":"OrderService.placeOrder","nt.chapterId":"OrderService.placeOrder","nt.entryType":"entry","nt.eventType":"method_exit","nt.schemaVersion":"1.0","nt.returnValue":null,"msg":"← returned: null"}
{"level":10,"code.namespace":"PaymentService","code.function":"charge","nt.depth":1,"nt.parameters":[{"name":"customerId","value":"\"C-1234\""},{"name":"amountCents","value":"7998"},{"name":"card","value":"[REDACTED]"}],"trace_id":"c4e1d0a7c4e1d0a7c4e1d0a7c4e1d0a7","nt.traceName":"solid wand romps","span_id":"0000000000000003","parent_span_id":"0000000000000001","nt.storyId":"OrderService.placeOrder","nt.chapterId":"OrderService.placeOrder","nt.entryType":"entry","nt.eventType":"method_enter","nt.schemaVersion":"1.0","msg":"→ PaymentService.charge"}
{"level":10,"nt.outcome":"returned","nt.depth":0,"trace_id":"c4e1d0a7c4e1d0a7c4e1d0a7c4e1d0a7","nt.traceName":"solid wand romps","span_id":"0000000000000003","parent_span_id":"0000000000000001","nt.storyId":"OrderService.placeOrder","nt.chapterId":"OrderService.placeOrder","nt.entryType":"entry","nt.eventType":"method_exit","nt.schemaVersion":"1.0","nt.returnValue":"\"PAY-C-1234-7998\"","msg":"← returned: \"PAY-C-1234-7998\""}
{"level":10,"code.namespace":"OrderRepository","code.function":"save","nt.depth":1,"nt.parameters":[{"name":"order","value":"{\"orderId\": \"ORD-C-1234-SKU-KB-2\", \"customerId\": \"C-1234\", \"sku\": \"SKU-KB\", \"quantity\": 2, \"amountCents\": 7998}"}],"trace_id":"c4e1d0a7c4e1d0a7c4e1d0a7c4e1d0a7","nt.traceName":"solid wand romps","span_id":"0000000000000004","parent_span_id":"0000000000000001","nt.storyId":"OrderService.placeOrder","nt.chapterId":"OrderService.placeOrder","nt.entryType":"entry","nt.eventType":"method_enter","nt.schemaVersion":"1.0","msg":"→ OrderRepository.save"}
{"level":10,"nt.outcome":"returned","nt.depth":0,"trace_id":"c4e1d0a7c4e1d0a7c4e1d0a7c4e1d0a7","nt.traceName":"solid wand romps","span_id":"0000000000000004","parent_span_id":"0000000000000001","nt.storyId":"OrderService.placeOrder","nt.chapterId":"OrderService.placeOrder","nt.entryType":"entry","nt.eventType":"method_exit","nt.schemaVersion":"1.0","nt.returnValue":null,"msg":"← returned: null"}
{"level":10,"nt.outcome":"returned","nt.depth":0,"trace_id":"c4e1d0a7c4e1d0a7c4e1d0a7c4e1d0a7","nt.traceName":"solid wand romps","span_id":"0000000000000001","nt.storyId":"OrderService.placeOrder","nt.chapterId":"OrderService.placeOrder","nt.entryType":"entry","nt.eventType":"method_exit","nt.schemaVersion":"1.0","nt.returnValue":"\"ORD-C-1234-SKU-KB-2\"","msg":"← returned: \"ORD-C-1234-SKU-KB-2\""}
```
<!-- /snippet -->

## How to read it

- A line whose `msg` starts with `→` opens a call and one starting with `←`
  closes it, matched by `span_id`: the first line and the last are the same
  span, `0000000000000001`, which is `OrderService.placeOrder`, and everything
  between them happened inside it. `parent_span_id` says who called whom. In
  the trace artifacts the same four calls carry the span ids `#1`, `#1.1`,
  `#1.2` and `#1.3` — [Review a complex flow before changing it](review-a-complex-flow-before-changing-it.md)
  reads them that way.
- Every entry line carries the parameter *names* the wrap declared, which is
  what makes it a sentence rather than a tuple: `nt.parameters` for `reserve`
  is `sku: "SKU-KB"` and `quantity: 2`, with no legend needed.
- `← returned: null` is a method with nothing to return — JavaScript has no
  `void`, so `undefined` is written as `null`. `← returned: "PAY-C-1234-7998"`
  carries the value: it is the gateway's own id, and `amountCents: 7998` is
  where the price of two keyboards comes from.
- Two values are gone. `cardNumber` is `[REDACTED]` because of its *name* —
  the always-on deny-list, no annotation, no configuration. `card`, one call
  down, is `[REDACTED]` because of its *value*: the parameter is named `card`,
  which the deny-list does not know, and the number it held is Luhn-valid, so
  the value-shape rule caught it anyway. See
  [Privacy and Redaction](../privacy-and-redaction.md).
- `nt.traceName`, `solid wand romps`, is the trace's own name on every line,
  so every line of one checkout can be grepped out of a busy log.

The conclusion this supports: the narrative came from the method names, the
parameter names and the values, and not one log statement was written to get
it.

## What is not captured

- **Only wrapped code is logged.** Four objects were wrapped above, so four
  calls appear. A call between two unwrapped classes — or a private method
  inside `DefaultOrderService` — is invisible here, and so is a call a wrapped
  object makes on itself. If wrapping every collaborator by hand is not what
  you want, [Choosing an Integration](../choosing-an-integration.md) is the
  trade-off per path.
- **A value matching the redaction rules is replaced before it is written,**
  including in this log line. That is not configurable downward, and it means
  a redacted parameter cannot be recovered from the log.
- **The logger's own level still applies.** These lines are `trace` on the
  logger; at `info` the file is empty and nothing warns you. The tracing level
  is the other dial: it decides what is captured, the logger decides what is
  written ([Configuration Guide, two dials](../configuration-guide.md#9-two-dials-two-paths)).
- **Timings are not in the log lines.** Each call's duration is in the trace
  artifacts, not here.

**The skill for this:** `add-narrative-tracing` — it installs the packages,
wraps the first class, and checks the wiring with `narrativetrace-doctor`.
