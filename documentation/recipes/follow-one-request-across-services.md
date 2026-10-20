# Follow one request across services (distributed tracing)

## The problem

> The checkout calls the payment service over HTTP. When an order goes wrong,
> I want one request across both — not two logs I have to line up by hand.

Two services, two log files, two sets of ids. What makes them one story is a
single value travelling with the request: the W3C
[`traceparent`](https://www.w3.org/TR/trace-context/#traceparent-header)
header. The caller sends the trace it is in and the span it is calling from;
the callee adopts the trace instead of starting one of its own. Below is one
run of exactly that, with both services' lines in one file.

## Minimal setup

Beyond the [install](../installation-guide.md), the caller needs nothing new:
`tracedFetch(context)` and `traceparentHeaders(context)` are in
`@narrativetrace/core-node`, which it already has. The callee needs the
inbound half — and which code that is depends on how it is built:

| The callee is | The inbound half is |
|---|---|
| An Express application | `@narrativetrace/express`'s `narrativeTrace()` middleware, which adopts the header for you |
| A Hono application | `@narrativetrace/hono`'s `narrativeTrace()` middleware, the same way |
| Anything else — a plain `node:http` server, a handler framework | Three lines in whatever runs first per request: read `traceparent`, `parseTraceparent(header)`, serve inside `context.run(fn, thatTraceparent)` |

This page's payment service is the third row: the checkout project runs
without a framework, so the handler reads the header itself. That is also the
honest example of what the middleware does, since it is the same three lines
([Framework Integration Guide](../framework-integration-guide.md)).

The log lines come from the pino bridge, as in
[Add logging to this service](add-logging-to-this-service.md). Both services
write to one file through it, each with a context of its own that names its
service, because the trace id is the thing being followed:

<!-- snippet: recipes/checkout/support/service-log.ts -->
```ts
// support/service-log.ts
import { mkdirSync, rmSync } from "node:fs";
import { dirname } from "node:path";
import {
  AsyncNarrativeContext,
  BufferedEventConsumer,
  DualPathPipeline,
  NarrativeTraceConfig,
} from "@narrativetrace/core-node";
import { createPinoEventConsumer } from "@narrativetrace/pino";
import pino from "pino";

/**
 * Whose lines these are (absent: no `service.name`, for a project with one service), and whether
 * this service starts the file (the default) or joins one already started.
 */
export interface ServiceLogOptions {
  readonly serviceName?: string;
  readonly fresh?: boolean;
}

function loggerAppendingTo(logFile: string, fresh: boolean): pino.Logger {
  mkdirSync(dirname(logFile), { recursive: true });
  if (fresh) rmSync(logFile, { force: true });
  const destination = pino.destination({ dest: logFile, sync: true });
  return pino({ level: "trace", base: null, timestamp: false }, destination);
}

/**
 * The context of one service among several: its events reach `logFile` through the project's own
 * pino logger and carry `service.name`. Two services pointed at one file write one interleaved
 * log, and the trace id on a line says which request it belongs to.
 *
 * @llmNote The context is asynchronous (`AsyncNarrativeContext`) because the services here answer
 * over HTTP: `run()` gives each request a scope of its own and `tracedFetch` reads the span that is
 * open in it.
 */
export function serviceContextLoggingTo(
  logFile: string,
  options: ServiceLogOptions = {},
): AsyncNarrativeContext {
  const consumer = createPinoEventConsumer(loggerAppendingTo(logFile, options.fresh ?? true));
  const pipeline = new DualPathPipeline(consumer, new BufferedEventConsumer());
  const identity =
    options.serviceName === undefined ? undefined : { serviceName: options.serviceName };
  return new AsyncNarrativeContext(new NarrativeTraceConfig(), pipeline, identity);
}
```
<!-- /snippet -->

## The scenario

**The caller's side: one header.** The checkout's payment collaborator is now
an HTTP client. `tracedFetch(context)` is global `fetch` that reads the span
open at the moment of the call and sets one header — everything else is an
ordinary request:

<!-- snippet: recipes/checkout/src/http-payment-service.ts -->
```ts
// src/http-payment-service.ts
import { type AsyncNarrativeContext, tracedFetch } from "@narrativetrace/core-node";
import { PaymentDeclinedError } from "./payments.js";

/** Charges a card through a payment service that is a different process; the answer is a promise. */
export interface RemotePaymentService {
  charge(customerId: string, amountCents: number, card: string): Promise<string>;
}

const DECLINED_STATUS = 402;

/**
 * The checkout's payment collaborator when the payment service is another process.
 *
 * INTENT: the outbound half of cross-service correlation, in the shape any HTTP client copies:
 * `tracedFetch(context)` is global `fetch` that stamps the W3C `traceparent` of the span open at
 * call time. The callee then continues this trace instead of starting its own.
 *
 * @llmNote The request body is a comma-separated line rather than JSON on purpose: this class exists
 * to show the header, and a parser would be the only thing a reader had to skip. `tracedFetch` is
 * the first thing `charge` calls, before any `await`: the header names the span that is open while
 * the call is made, and that is `charge`'s own only until the method first yields.
 *
 * @edgeCase With no span open there is nothing to name, and `tracedFetch` sends no header at all —
 * the honest outcome, since a header without a real parent id would point the callee at a span that
 * never existed.
 */
export class HttpPaymentService implements RemotePaymentService {
  private readonly send: typeof globalThis.fetch;

  constructor(
    context: AsyncNarrativeContext,
    private readonly endpoint: string,
  ) {
    this.send = tracedFetch(context);
  }

  async charge(customerId: string, amountCents: number, card: string): Promise<string> {
    const response = await this.send(this.endpoint, {
      method: "POST",
      body: `${customerId},${amountCents},${card}`,
    });
    const body = await response.text();
    if (response.status === DECLINED_STATUS) {
      throw new PaymentDeclinedError(body);
    }
    return body;
  }
}
```
<!-- /snippet -->

The checkout around it is the one every page uses, with `await` where the
payment call is (`src/remote-order-service.ts`): reserve, charge, save, and
release on a decline.

**The callee's side: its own context.** The payment service is a second
service, which means a second narrative context — created with its own
service name, so one log file can tell the two apart
(`support/payment-service-process.ts`):

<!-- snippet: recipes/checkout/support/payment-service-process.ts region=own-context -->
```ts
    this.context = serviceContextLoggingTo(logFile, {
      serviceName: "payment-service",
      fresh: false,
    });
    this.payments = traceObject(
      new CardPaymentService(),
      this.context,
      { charge: ["customerId", "amountCents", "card"] },
      { className: "PaymentService" },
    );
```
<!-- /snippet -->

**The callee's side: read, run, capture, reset.** This is the whole inbound
half, in the same file — and the same sequence the Express and Hono
middleware perform for an application built on them:

<!-- snippet: recipes/checkout/support/payment-service-process.ts region=inbound -->
```ts
  private async handle(req: IncomingMessage, res: ServerResponse): Promise<void> {
    const traceparent = req.headers.traceparent as string | undefined;
    const body = await readBody(req);
    await this.context.run(async () => {
      try {
        const [customerId, amountCents, card] = body.split(",") as [string, string, string];
        respond(res, OK, this.payments.charge(customerId, Number(amountCents), card));
      } catch (error) {
        if (!(error instanceof PaymentDeclinedError)) throw error;
        respond(res, PAYMENT_REQUIRED, error.message);
      } finally {
        this.served = { traceparent, trace: this.context.captureTrace() };
        this.context.reset();
      }
    }, parseTraceparent(traceparent));
  }
```
<!-- /snippet -->

**The run.** The checkout, wrapped as always, with the HTTP client where the
local payment service used to be. The server is a loopback `node:http` server
in the same process: the request really crosses a socket and the header really
arrives as a header, which is what this page is about — a second process would
add a second start-up and prove nothing further:

<!-- snippet: recipes/checkout/__tests__/across-services-recipe.test.ts -->
```ts
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
```
<!-- /snippet -->

## The actual output

**Both services' lines, one file** — the caller's carry
`"service.name":"checkout"`, the payment service's
`"service.name":"payment-service"`:

<!-- snippet: recipes/checkout/narrativetrace-output/recipes/follow-one-request-across-services/checkout.log -->
```text
{"level":10,"code.namespace":"OrderService","code.function":"placeOrder","nt.depth":0,"nt.parameters":[{"name":"customerId","value":"\"C-1234\""},{"name":"sku","value":"\"SKU-KB\""},{"name":"quantity","value":"2"},{"name":"cardNumber","value":"[REDACTED]"}],"trace_id":"c4e1d0a7c4e1d0a7c4e1d0a7c4e1d0a7","nt.traceName":"solid wand romps","span_id":"0000000000000001","parent_span_id":"c4e1d0a7c4e1d0a7","service.name":"checkout","nt.entryType":"entry","nt.eventType":"method_enter","nt.schemaVersion":"1.0","msg":"→ OrderService.placeOrder"}
{"level":10,"code.namespace":"InventoryService","code.function":"reserve","nt.depth":1,"nt.parameters":[{"name":"sku","value":"\"SKU-KB\""},{"name":"quantity","value":"2"}],"trace_id":"c4e1d0a7c4e1d0a7c4e1d0a7c4e1d0a7","nt.traceName":"solid wand romps","span_id":"0000000000000002","parent_span_id":"0000000000000001","service.name":"checkout","nt.entryType":"entry","nt.eventType":"method_enter","nt.schemaVersion":"1.0","msg":"→ InventoryService.reserve"}
{"level":10,"nt.outcome":"returned","nt.depth":0,"trace_id":"c4e1d0a7c4e1d0a7c4e1d0a7c4e1d0a7","nt.traceName":"solid wand romps","span_id":"0000000000000002","parent_span_id":"0000000000000001","service.name":"checkout","nt.entryType":"entry","nt.eventType":"method_exit","nt.schemaVersion":"1.0","nt.returnValue":null,"msg":"← returned: null"}
{"level":10,"code.namespace":"PaymentService","code.function":"charge","nt.depth":1,"nt.parameters":[{"name":"customerId","value":"\"C-1234\""},{"name":"amountCents","value":"7998"},{"name":"card","value":"[REDACTED]"}],"trace_id":"c4e1d0a7c4e1d0a7c4e1d0a7c4e1d0a7","nt.traceName":"solid wand romps","span_id":"0000000000000003","parent_span_id":"0000000000000001","service.name":"checkout","nt.entryType":"entry","nt.eventType":"method_enter","nt.schemaVersion":"1.0","msg":"→ PaymentService.charge"}
{"level":10,"code.namespace":"PaymentService","code.function":"charge","nt.depth":0,"nt.parameters":[{"name":"customerId","value":"\"C-1234\""},{"name":"amountCents","value":"7998"},{"name":"card","value":"[REDACTED]"}],"trace_id":"c4e1d0a7c4e1d0a7c4e1d0a7c4e1d0a7","nt.traceName":"solid wand romps","span_id":"0000000000000004","parent_span_id":"0000000000000003","service.name":"payment-service","nt.entryType":"entry","nt.eventType":"method_enter","nt.schemaVersion":"1.0","msg":"→ PaymentService.charge"}
{"level":10,"nt.outcome":"returned","nt.depth":0,"trace_id":"c4e1d0a7c4e1d0a7c4e1d0a7c4e1d0a7","nt.traceName":"solid wand romps","span_id":"0000000000000004","parent_span_id":"0000000000000003","service.name":"payment-service","nt.entryType":"entry","nt.eventType":"method_exit","nt.schemaVersion":"1.0","nt.returnValue":"\"PAY-C-1234-7998\"","msg":"← returned: \"PAY-C-1234-7998\""}
{"level":10,"nt.outcome":"returned","nt.depth":0,"trace_id":"c4e1d0a7c4e1d0a7c4e1d0a7c4e1d0a7","nt.traceName":"solid wand romps","span_id":"0000000000000003","parent_span_id":"0000000000000001","service.name":"checkout","nt.entryType":"entry","nt.eventType":"method_exit","nt.schemaVersion":"1.0","nt.returnValue":"\"PAY-C-1234-7998\"","msg":"← returned: \"PAY-C-1234-7998\""}
{"level":10,"code.namespace":"OrderRepository","code.function":"save","nt.depth":1,"nt.parameters":[{"name":"order","value":"{\"orderId\": \"ORD-C-1234-SKU-KB-2\", \"customerId\": \"C-1234\", \"sku\": \"SKU-KB\", \"quantity\": 2, \"amountCents\": 7998}"}],"trace_id":"c4e1d0a7c4e1d0a7c4e1d0a7c4e1d0a7","nt.traceName":"solid wand romps","span_id":"0000000000000005","parent_span_id":"0000000000000001","service.name":"checkout","nt.entryType":"entry","nt.eventType":"method_enter","nt.schemaVersion":"1.0","msg":"→ OrderRepository.save"}
{"level":10,"nt.outcome":"returned","nt.depth":0,"trace_id":"c4e1d0a7c4e1d0a7c4e1d0a7c4e1d0a7","nt.traceName":"solid wand romps","span_id":"0000000000000005","parent_span_id":"0000000000000001","service.name":"checkout","nt.entryType":"entry","nt.eventType":"method_exit","nt.schemaVersion":"1.0","nt.returnValue":null,"msg":"← returned: null"}
{"level":10,"nt.outcome":"returned","nt.depth":0,"trace_id":"c4e1d0a7c4e1d0a7c4e1d0a7c4e1d0a7","nt.traceName":"solid wand romps","span_id":"0000000000000001","parent_span_id":"c4e1d0a7c4e1d0a7","service.name":"checkout","nt.entryType":"entry","nt.eventType":"method_exit","nt.schemaVersion":"1.0","nt.returnValue":"\"ORD-C-1234-SKU-KB-2\"","msg":"← returned: \"ORD-C-1234-SKU-KB-2\""}
```
<!-- /snippet -->

**The caller's own trace,** the value-free structural artifact of that run
(`narrativetrace-output/recipes/follow-one-request-across-services/checkout.nt`)
— the span ids below are the ones this page reads by:

<!-- snippet: recipes/checkout/narrativetrace-output/recipes/follow-one-request-across-services/checkout.nt -->
```text
scenario: a customer checks out against the payment service

#1 - OrderService.placeOrder(customerId, sku, quantity, cardNumber) → value
  #1.1 - InventoryService.reserve(sku, quantity)
  #1.2 - PaymentService.charge(customerId, amountCents, card) → value
  #1.3 - OrderRepository.save(order)

```
<!-- /snippet -->

**The payment service's own narrative,** captured by its own context at the
end of the request and rendered beside the caller's:

<!-- snippet: recipes/checkout/narrativetrace-output/recipes/follow-one-request-across-services/payment-service.md mask=duration -->
```text
- `PaymentService.charge(customerId: "C-1234", amountCents: 7998, card: [REDACTED])` → `"PAY-C-1234-7998"` — 0.71ms #1
```
<!-- /snippet -->

## How to read it

- **One trace id, in both services' lines.**
  `c4e1d0a7c4e1d0a7c4e1d0a7c4e1d0a7` is the `trace_id` of every line above, the
  caller's and the callee's alike. The caller's is the trace this run is in;
  the callee's is that same id because it *adopted* it from the header.
  Nothing correlates them after the fact — they were never apart.
- **The two services are told apart by `service.name`, not by the id.**
  `checkout` is the caller, `payment-service` is the callee, because each
  context was built with its own service identity. The two never share a
  context: a service has its own, which is also what you have in production,
  where the other service is a different process on a different host.
- **The caller's `#1.2` and the callee's `#1` are the same work, seen from
  both ends.** In the caller's trace, `#1.2 PaymentService.charge` is the
  *client* span: it starts when the checkout calls the client and ends when the
  response comes back, so it includes the whole round trip. In the payment
  service's narrative, `#1 PaymentService.charge` is the *server* span: the
  work it actually did. Each service numbers its own spans from `#1` — the
  join is the trace id, not the number.
- **The header names the caller's `charge` span as the parent.** The request
  carried `00-c4e1d0a7c4e1d0a7c4e1d0a7c4e1d0a7-<the caller's #1.2 span id>-01`.
  Span ids are random in a real run, so the test pins them to a counter to make
  the log reproducible (`support/stable-ids.ts`; never do that in your own
  project): the caller's `charge` is `0000000000000003`, and
  `assertTheTraceCrossedTheWire` above asserts that the header's parent field
  *is* that id, that the callee's root carries the sent trace id, and that the
  callee's `charge` root records that same id as its `parentSpanId`. That
  parent is the link between the two trees.
- **How to join them in a log search.** The trace id is the `trace_id` field on
  every line NarrativeTrace writes, in either service. One request across both
  is `grep c4e1d0a7c4e1d0a7c4e1d0a7c4e1d0a7` — or, in whatever aggregator you
  run, `trace_id:"c4e1…"`. The trace *name* that
  [Add logging to this service](add-logging-to-this-service.md) greps by
  (`nt.traceName`) is derived from the same id, so it works as a search key
  too, and reads better for a human.
- **The two narratives stay two.** The payment service's spans are in the
  payment service's trace, not in the caller's: `captureTrace()` on either
  side returns that side's work. One trace id, two trees.

## What is not captured

- **A hop through a service that does not forward the header breaks the
  chain.** Correlation is cooperative: the chain holds for as long as every
  service in it *passes `traceparent` on*. A proxy, a queue consumer or a
  third-party service that drops the header leaves the next NarrativeTrace
  service with nothing to adopt, and it starts a fresh trace — correctly, since
  it has no honest parent to name. A service with no NarrativeTrace at all is
  fine *if* it forwards the header it received.
- **No header is sent when there is nothing to name.** With no span open,
  `tracedFetch` adds nothing rather than a `traceparent` pointing at a span
  that never existed (the second test of the scenario asserts it). An untraced
  call out of the checkout therefore cannot be joined, and that is by design.
  A `traceparent` you set yourself is never overwritten.
- **The header is read when the call is made.** `tracedFetch` names the span
  that is open at that moment, so the HTTP call has to be made while the traced
  method is still running its synchronous part — `HttpPaymentService.charge`
  calls it before its first `await`. A client call made after an earlier
  `await` inside the same method would not name `charge`'s span.
- **`traceparent` only.** The client above sends no `tracestate` and no
  baggage: nothing in this path reads or writes vendor state, and no
  application value crosses the wire because of tracing.
- **Nothing comes back.** The response carries no trace header, so the
  caller's narrative says what it sent and what it got, never what the callee
  did inside. The callee's own narrative is the record of that, and the trace
  id is what finds it.
- **Two services, one process, one socket.** What this run does not exercise is
  a second process and a network that can fail. The header mechanism is
  unchanged by either; the failure modes of the call itself are your HTTP
  client's. The caller's `.nt` is embedded rather than its Markdown because
  the Markdown flags a node over 200 ms as slow, and a round trip is the span
  most likely to cross that on a loaded host; the structural trace carries no
  durations.

**The skill for this:** `narrativetrace-verify` — a change that crosses
services is exactly the case it exists for: write the intent down, run the
smallest real path, and read the trace against it before calling it done.
