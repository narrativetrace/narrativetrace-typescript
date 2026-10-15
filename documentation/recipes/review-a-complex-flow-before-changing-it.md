# Review a complex flow before changing it

## The problem

> Before you change the checkout, tell me what it actually does.

Reading the source answers what it *can* do. One run answers what it *does*
with these inputs — in what order, with which values, and where the flow
leaves the code you are about to edit. This page deliberately never shows the
implementation: that is the point of reading a run instead.

## Minimal setup

Nothing beyond the [install](../installation-guide.md) and
`@narrativetrace/vitest` for the trace artifacts. The log lines need the
logger bridge and its wiring, exactly as in
[Add logging to this service](add-logging-to-this-service.md). The capture
level is one setting, and `summary` is the one this page uses beside the
default `detail`:

```ts
const test = createNarrativeTest({ level: "summary" }); // or NARRATIVETRACE_LEVEL=summary
// "off" | "errors" | "summary" | "narrative" | "detail"
```

See [Configuration Guide § 1](../configuration-guide.md#1-tracing-levels-narrativetraceconfig).

## The scenario

One representative run of the flow — an existing test is the cheapest one to
borrow, and this is that test:

<!-- snippet: recipes/checkout/fixtures/checkout-review-fixture.ts -->
```ts
// fixtures/checkout-review-fixture.ts
import { createNarrativeTest } from "@narrativetrace/vitest";
import { expect } from "vitest";
import { tracedCheckout } from "../support/wiring.js";

const test = createNarrativeTest();

/**
 * One successful checkout, the flow documentation/recipes/review-a-complex-flow-before-changing-it.md
 * is read before changing anything.
 *
 * A fixture because the page needs the same run under two capture levels:
 * `__tests__/review-flow-recipe.test.ts` runs it in a nested Vitest process once at the default
 * level and once at `summary`. It passes either way — nothing here fails by design.
 */
test("a customer buys two keyboards", ({ narrativeContext }) => {
  const { checkout, stock, repository } = tracedCheckout(narrativeContext);

  const orderId = checkout.placeOrder("C-1234", "SKU-KB", 2, "4242424242424242");

  expect(orderId).toBe("ORD-C-1234-SKU-KB-2");
  expect(stock.availableUnits("SKU-KB")).toBe(3);
  expect(repository.saved()).toHaveLength(1);
});
```
<!-- /snippet -->

## The actual output

**At `detail`** (the default), the narrative `createNarrativeTest` wrote for it
at `narrativetrace-output/checkout-review-fixture/a_customer_buys_two_keyboards.md`
(shown without its frontmatter, which carries the run's name, a fresh trace id
and a wall-clock duration that differ on every run):

<!-- snippet: recipes/checkout/narrativetrace-output/recipes/review-a-complex-flow-before-changing-it/detail/narratives/a_customer_buys_two_keyboards.md mask=duration -->
```text
- `OrderService.placeOrder(customerId: "C-1234", sku: "SKU-KB", quantity: 2, cardNumber: [REDACTED])` → `"ORD-C-1234-SKU-KB-2"` — 1ms #1
  - `InventoryService.reserve(sku: "SKU-KB", quantity: 2)` — 0.1ms #1.1
  - `PaymentService.charge(customerId: "C-1234", amountCents: 7998, card: [REDACTED])` → `"PAY-C-1234-7998"` — 0.07ms #1.2
  - `OrderRepository.save(order: {"orderId": "ORD-C-1234-SKU-KB-2", "customerId": "C-1234", "sku": "SKU-KB", "quantity": 2, "amountCents": 7998})` — 0.02ms #1.3
```
<!-- /snippet -->

**At `summary`**, the same run of the same test:

<!-- snippet: recipes/checkout/narrativetrace-output/recipes/review-a-complex-flow-before-changing-it/summary/narratives/a_customer_buys_two_keyboards.md mask=duration -->
```text
- `OrderService.placeOrder(customerId: , sku: , quantity: , cardNumber: [REDACTED])` → `"ORD-C-1234-SKU-KB-2"` — 1ms #1
  - `InventoryService.reserve(sku: , quantity: )` — 0.13ms #1.1
  - `PaymentService.charge(customerId: , amountCents: , card: )` → `"PAY-C-1234-7998"` — 0.62ms #1.2
  - `OrderRepository.save(order: )` — 0.02ms #1.3
```
<!-- /snippet -->

**The log the same flow wrote** through the project's own logger, values and
all:

<!-- snippet: recipes/checkout/narrativetrace-output/recipes/review-a-complex-flow-before-changing-it/checkout.log -->
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

**The structural trace of that run**,
`narrativetrace-output/structural/checkout-review-fixture/a_customer_buys_two_keyboards.nt`:

<!-- snippet: recipes/checkout/narrativetrace-output/recipes/review-a-complex-flow-before-changing-it/detail/structural/checkout-review-fixture/a_customer_buys_two_keyboards.nt -->
```text
scenario: a customer buys two keyboards

#1 - OrderService.placeOrder(customerId, sku, quantity, cardNumber) → value
  #1.1 - InventoryService.reserve(sku, quantity)
  #1.2 - PaymentService.charge(customerId, amountCents, card) → value
  #1.3 - OrderRepository.save(order)
```
<!-- /snippet -->

## How to read it

**The flow, from the `detail` artifact.** `#1` is the call the test made and
the only root: everything indented under it happened inside it, in the order
printed. `#1.1` reserves two units before anything is charged; `#1.2` charges
7998 — two units at 3999, so the price is derived from the quantity and not
passed in; `#1.3` saves an order that already carries the id `#1` returns.
Read as a sentence: this checkout reserves first, charges second, saves third,
and the order id is minted before the save. A change that charges before it
reserves, or saves before it charges, is a change to *this*, and now you know
it without trusting a comment.

**What each level is for.** `detail` carries the parameter values, and it is
what you read while working on the flow. At `summary` every parameter value
is left out — suppressed at capture, not hidden at render: the name stays, and
nothing follows it — and only the root and the leaf calls are kept; this flow
is two levels deep, so no call is intermediate and the same four calls appear.
A deeper flow loses its middle. Return values survive at every active level:
the return is the payload of a narrative. `narrative` sits between the two, the
full call flow without the values. Use `summary` where the shape and the
outcomes are what you need and the values are cost — a CI run, a long soak —
and `off`/`errors` in production until you need more.

**Which output a human reads, and which an agent reads.** The log lines are
for the human on call: they interleave with everything else the service logs,
carry the values, and are keyed by the trace's name — `solid wand romps` — so
one checkout can be grepped out of a busy file. The `.nt` is for the agent
and the reviewer: **value-free by construction** — compare it with the log
line above and the difference is not that the values were replaced but that
they were never written. `(customerId, sku, quantity, cardNumber)` is the
parameter *names*; `→ value` says a value was returned without saying which.
That is what makes it safe to commit, to diff in a review, and to hand to a
model: it cannot leak a customer id, and it does not change when the data
changes — only when the *calls* change. Pinning it is
[Review a refactoring: did behaviour change](review-a-refactoring-did-behaviour-change.md).

## What is not captured

- **Calls inside unwrapped classes.** Four objects were wrapped; a call
  between two classes behind them, or a private method, never appears. A flow
  that looks shallow may be deep.
- **What the chosen integration does not intercept.** The proxy sees calls
  made *through* the wrapped reference only: an inner call a class makes on
  itself (`this.helper()`) is invisible to it — `InMemoryInventory.reserve`
  asks its own `availableUnits`, and no `#1.1.1` appears.
  [Choosing an Integration](../choosing-an-integration.md) is the trade-off per
  path, and this is the part of it that changes what you can read here.
- **Work that left the process.** A call into a worker thread or another
  service runs in a context of its own; the trace ends where this process's
  wrapped work did, unless the trace identity is carried across
  ([Framework Integration Guide](../framework-integration-guide.md)).
- **Values the deny-list or the value-shape rule caught**, here `cardNumber`
  and `card`, are `[REDACTED]` in both the log and the `detail` artifact, and
  absent by construction from the `.nt`.
- **One run, not the contract.** Another input takes another path — an
  out-of-stock sku never reaches `#1.2` at all.

**The skill for this:** `narrativetrace-verify` — it writes the intent down
first, runs the smallest real path, and reads the value-free trace against
that intent before anything is called done.
