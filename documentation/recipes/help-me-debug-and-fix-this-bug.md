# Help me debug and fix this bug

## The problem

> Help me debug and fix this bug: a customer's card was declined and the
> keyboard never came back into stock.

The error the team has is `PaymentDeclinedError: card declined by the
issuer`, which is not the bug. The bug is what the checkout did *after* it.

## Minimal setup

Nothing beyond the [install](../installation-guide.md) and
`@narrativetrace/vitest`: its `createNarrativeTest` fixture writes one trace per
test with no configuration. The last step on this page — pinning the fixed
flow — turns on approval mode, which is one setting, either in code or in the
environment:

```ts
const test = createNarrativeTest({ approval: true }); // or NARRATIVETRACE_APPROVAL=true
```

See [Configuration Guide § 2](../configuration-guide.md#2-vitest-configuration),
[Structural Trace Format](../structural-trace-format.md#approval-traces-end-to-end)
and [What to Commit](../what-to-commit.md).

## The scenario

Reproduce it in the smallest test that can fail for this reason — a declined
card must leave the stock as it found it:

<!-- snippet: recipes/checkout/fixtures/declined-payment-fixture.ts -->
```ts
// fixtures/declined-payment-fixture.ts
import { createNarrativeTest } from "@narrativetrace/vitest";
import { expect } from "vitest";
import { OrderServiceWithoutRelease } from "../src/order-service-without-release.js";
import { DECLINING_CARD, PaymentDeclinedError } from "../src/payments.js";
import { tracedCheckout } from "../support/wiring.js";

const test = createNarrativeTest();

/**
 * The reproduction documentation/recipes/help-me-debug-and-fix-this-bug.md is written around: a
 * declined card must leave the stock as it found it.
 *
 * The second test is the same reproduction against the checkout as it stood before the fix
 * (`OrderServiceWithoutRelease`), so the page's "before" trace comes from a real failing run rather
 * than from prose. It FAILS by design, which is why this file is a fixture: the project's own
 * config never collects `*-fixture.ts`, and `__tests__/debug-recipe.test.ts` runs it in a nested
 * Vitest process and asserts on its verdict.
 */
test("the stock is released when the card is declined", ({ narrativeContext }) => {
  const { checkout, stock, repository } = tracedCheckout(narrativeContext);

  expect(() => checkout.placeOrder("C-1234", "SKU-KB", 2, DECLINING_CARD)).toThrow(
    PaymentDeclinedError,
  );

  expect(repository.saved()).toHaveLength(0);
  expect(stock.availableUnits("SKU-KB")).toBe(5);
});

test("the stock is released when the card is declined before the fix", ({ narrativeContext }) => {
  const { checkout, stock, repository } = tracedCheckout(
    narrativeContext,
    ({ inventory, payments, orders }) =>
      new OrderServiceWithoutRelease(inventory, payments, orders),
  );

  expect(() => checkout.placeOrder("C-1234", "SKU-KB", 2, DECLINING_CARD)).toThrow(
    PaymentDeclinedError,
  );

  expect(repository.saved()).toHaveLength(0);
  expect(stock.availableUnits("SKU-KB")).toBe(5);
});
```
<!-- /snippet -->

The second test runs the same reproduction against the checkout as it stood
before the fix, which is the run the first trace below comes from:

<!-- snippet: recipes/checkout/src/order-service-without-release.ts -->
```ts
// src/order-service-without-release.ts
import type { InventoryService } from "./inventory.js";
import type { OrderService } from "./order-service.js";
import type { Order, OrderRepository } from "./orders.js";
import type { PaymentService } from "./payments.js";

const UNIT_PRICE_CENTS = 3999;

/**
 * The same checkout with no release path: a declined charge leaves the reservation behind.
 *
 * INTENT: two recipe pages need this code to RUN, not to be described —
 * `documentation/recipes/help-me-debug-and-fix-this-bug.md` (the bug, before its fix) and
 * `documentation/recipes/review-a-refactoring-did-behaviour-change.md` (the refactoring that drops
 * the release call while every test stays green). It is kept beside `DefaultOrderService` rather
 * than reconstructed by a flag, so each page embeds real source and each run is a real run.
 *
 * @llmNote Never the implementation to copy: `DefaultOrderService` is. The tests wrap both under
 * the class name `OrderService`, so one approved baseline is comparable across the two.
 */
export class OrderServiceWithoutRelease implements OrderService {
  constructor(
    private readonly inventory: InventoryService,
    private readonly payments: PaymentService,
    private readonly orders: OrderRepository,
  ) {}

  placeOrder(customerId: string, sku: string, quantity: number, cardNumber: string): string {
    this.inventory.reserve(sku, quantity);
    const amountCents = UNIT_PRICE_CENTS * quantity;
    this.payments.charge(customerId, amountCents, cardNumber);
    const orderId = `ORD-${customerId}-${sku}-${quantity}`;
    const order: Order = { orderId, customerId, sku, quantity, amountCents };
    this.orders.save(order);
    return orderId;
  }
}
```
<!-- /snippet -->

## The actual output

The failing run's own narrative — the Markdown artifact `createNarrativeTest`
wrote for the failing test, under
`narrativetrace-output/declined-payment-fixture/`, without its frontmatter,
which carries the run's name, a fresh trace id and a wall-clock duration that
differ on every run:

<!-- snippet: recipes/checkout/narrativetrace-output/recipes/help-me-debug-and-fix-this-bug/narratives/the_stock_is_released_when_the_card_is_declined_before_the_fix.md mask=duration -->
```text
- `OrderService.placeOrder(customerId: "C-1234", sku: "SKU-KB", quantity: 2, cardNumber: [REDACTED])` ❌ `PaymentDeclinedError`: card declined by the issuer — 0.36ms #1
  - `InventoryService.reserve(sku: "SKU-KB", quantity: 2)` — 0.02ms #1.1
  - `PaymentService.charge(customerId: "C-1234", amountCents: 7998, card: [REDACTED])` ❌ `PaymentDeclinedError`: card declined by the issuer — 0.02ms #1.2
```
<!-- /snippet -->

The fix is one `catch`: release what was reserved, then let the decline
propagate as before.

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

The same reproduction, now passing, against the fixed checkout:

<!-- snippet: recipes/checkout/narrativetrace-output/recipes/help-me-debug-and-fix-this-bug/narratives/the_stock_is_released_when_the_card_is_declined.md mask=duration -->
```text
- `OrderService.placeOrder(customerId: "C-1234", sku: "SKU-KB", quantity: 2, cardNumber: [REDACTED])` ❌ `PaymentDeclinedError`: card declined by the issuer — 2ms #1
  - `InventoryService.reserve(sku: "SKU-KB", quantity: 2)` — 0.13ms #1.1
  - `PaymentService.charge(customerId: "C-1234", amountCents: 7998, card: [REDACTED])` ❌ `PaymentDeclinedError`: card declined by the issuer — 0.23ms #1.2
  - `InventoryService.release(sku: "SKU-KB", quantity: 2)` — 0.24ms #1.3
```
<!-- /snippet -->

With approval mode on, the first run of the fixed test writes its value-free
structure beside the approved traces as `.received.nt`;
`npx narrativetrace-approve` promotes it to `.approved.nt`, the committed
baseline, which is now the shape of this flow:

<!-- snippet: recipes/checkout/narratives/declined-payment-fixture/the_stock_is_released_when_the_card_is_declined.approved.nt -->
```text
scenario: the stock is released when the card is declined

#1 - OrderService.placeOrder(customerId, sku, quantity, cardNumber) !! PaymentDeclinedError
  #1.1 - InventoryService.reserve(sku, quantity)
  #1.2 - PaymentService.charge(customerId, amountCents, card) !! PaymentDeclinedError
  #1.3 - InventoryService.release(sku, quantity)
```
<!-- /snippet -->

## How to read it

In the failing trace:

- `#1 OrderService.placeOrder` ends with `❌ PaymentDeclinedError` and no
  return value: the call the customer made did not complete.
- `#1.1 InventoryService.reserve(sku: "SKU-KB", quantity: 2)` has no `❌` and
  no value — a method with nothing to return that completed. Two units are now
  held.
- `#1.2 PaymentService.charge` threw. Its parameters say what was attempted:
  `amountCents: 7998` for the two units, `card: [REDACTED]`.
- **Nothing follows `#1.2`.** `#1` goes straight from the charge to its own
  failure, so the two units `#1.1` reserved are still held. That absence is
  the bug, and the exception message never mentions it — the trace is what
  makes an omission visible, because it shows the whole flow and not only the
  line that threw. The failing assertion says the same thing from the other
  side, `expected 3 to be 5`, and says nothing of why.

In the passing trace: `#1.3 InventoryService.release(sku: "SKU-KB", quantity: 2)`
now sits between the charge and the failure. `#1` still ends in the decline —
that is correct, the customer's card really was declined — and the stock is
back.

In the baseline: the approved `.nt` carries the same four calls with their
parameter *names* and no values at all, which is why it can be committed and
read in a review. `#1.3` is now part of the pinned shape: a later change that
drops the release makes a passing test fail with a diff naming
`InventoryService.release`, so this bug cannot silently return. That is
[Review a refactoring: did behaviour change](review-a-refactoring-did-behaviour-change.md).

## What is not captured

- **The trace shows calls that happened, not calls that should have.** The
  missing `release` is an absence a reader infers from the flow; nothing in
  the artifact says "a call is missing". What the baseline adds is the
  comparison that turns an absence into a build failure — once.
- **An exception swallowed inside unwrapped code is invisible.** Only the four
  wrapped objects appear. A `try`/`catch` inside `DefaultOrderService` that
  ate the decline and returned normally would show as a completed call.
- **The card number cannot be recovered** from the trace or the log. It is
  redacted at capture, by value here — the parameter is named `card`, so the
  name deny-list never saw it, and the number is Luhn-valid.
- **Timings are not evidence of a performance problem** in a test this small:
  a single traced call in a fresh process measures warm-up, not the code.

**The skill for this:** `narrativetrace-debug` — it reproduces the symptom
with the smallest input, names the span where the value or the call diverges,
fixes it there, and pins the flow as a regression test behind your approval.
