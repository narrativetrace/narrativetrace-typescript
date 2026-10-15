# Review a refactoring: did behaviour change

## The problem

> I refactored the checkout. The tests are green. Did the behaviour change?

Green means no assertion noticed. A refactoring that drops a call nobody
asserts on is green and wrong, and this is the common shape of it: the
compensating call on an error path, which no happy-path test reaches.

## Minimal setup

Beyond the [install](../installation-guide.md) and `@narrativetrace/vitest`,
approval mode — one setting, and a directory of committed baselines:

```ts
const test = createNarrativeTest({
  approval: true, // compare, don't just write — or NARRATIVETRACE_APPROVAL=true
  approvedDir: "narratives", // the default; commit it
});
```

The first run of each test writes `narratives/<test file>/<scenario>.received.nt`
and fails; you read it, run `npx narrativetrace-approve` to promote every
reviewed file to `.approved.nt`, and commit those. See
[Configuration Guide § 2](../configuration-guide.md#2-vitest-configuration),
[Structural Trace Format](../structural-trace-format.md#approval-traces-end-to-end)
and [What to Commit](../what-to-commit.md).

## The scenario

The test pins the error path a refactoring is most likely to break — a
declined card must save no order — and it passes against both versions of the
checkout, which is the whole problem:

<!-- snippet: recipes/checkout/fixtures/refactored-checkout-fixture.ts -->
```ts
// fixtures/refactored-checkout-fixture.ts
import { createNarrativeTest } from "@narrativetrace/vitest";
import { expect } from "vitest";
import { DefaultOrderService } from "../src/order-service.js";
import { OrderServiceWithoutRelease } from "../src/order-service-without-release.js";
import { DECLINING_CARD, PaymentDeclinedError } from "../src/payments.js";
import { type CheckoutFactory, tracedCheckout } from "../support/wiring.js";

const test = createNarrativeTest();

/**
 * Which version of the checkout this run wires: the one that releases the reservation when the
 * charge is declined, or the refactoring that dropped that call. An environment variable, because
 * one build has to run both — in your project the refactoring is an edit to one file and this
 * switch does not exist.
 */
const refactoringDroppedTheRelease = process.env.RECIPE_REFACTORING_DROPPED_THE_RELEASE === "true";

const checkoutVersion: CheckoutFactory = ({ inventory, payments, orders }) =>
  refactoringDroppedTheRelease
    ? new OrderServiceWithoutRelease(inventory, payments, orders)
    : new DefaultOrderService(inventory, payments, orders);

/**
 * The test documentation/recipes/review-a-refactoring-did-behaviour-change.md pins: a declined card
 * must save no order. It passes before and after the refactoring — which is the whole point of the
 * page — so only the approved structure can object.
 *
 * A fixture because `__tests__/refactoring-recipe.test.ts` runs it twice under approval mode, once
 * per version of the checkout, in nested Vitest processes, and reads the verdicts.
 */
test("a declined card saves no order", ({ narrativeContext }) => {
  const { checkout, repository } = tracedCheckout(narrativeContext, checkoutVersion);

  expect(() => checkout.placeOrder("C-1234", "SKU-KB", 2, DECLINING_CARD)).toThrow(
    PaymentDeclinedError,
  );

  expect(repository.saved()).toHaveLength(0);
});
```
<!-- /snippet -->

## The actual output

The committed baseline, at
`narratives/refactored-checkout-fixture/a_declined_card_saves_no_order.approved.nt`:

<!-- snippet: recipes/checkout/narratives/refactored-checkout-fixture/a_declined_card_saves_no_order.approved.nt -->
```text
scenario: a declined card saves no order

#1 - OrderService.placeOrder(customerId, sku, quantity, cardNumber) !! PaymentDeclinedError
  #1.1 - InventoryService.reserve(sku, quantity)
  #1.2 - PaymentService.charge(customerId, amountCents, card) !! PaymentDeclinedError
  #1.3 - InventoryService.release(sku, quantity)
```
<!-- /snippet -->

The refactored run's verdict — the assertions passed, the structure did not:

<!-- snippet: recipes/checkout/narrativetrace-output/recipes/review-a-refactoring-did-behaviour-change/approval-rejection.txt -->
```text
Error: Trace changed against the approved trace (-1 call InventoryService.release):
 scenario: a declined card saves no order
 
 #1 - OrderService.placeOrder(customerId, sku, quantity, cardNumber) !! PaymentDeclinedError
   #1.1 - InventoryService.reserve(sku, quantity)
   #1.2 - PaymentService.charge(customerId, amountCents, card) !! PaymentDeclinedError
-  #1.3 - InventoryService.release(sku, quantity)
If this change is intended, run the approve-narratives script.
```
<!-- /snippet -->

And the file it offers for review, which `narrativetrace-approve` would
promote:

<!-- snippet: recipes/checkout/narrativetrace-output/recipes/review-a-refactoring-did-behaviour-change/approved-after-the-refactoring/refactored-checkout-fixture/a_declined_card_saves_no_order.received.nt -->
```text
scenario: a declined card saves no order

#1 - OrderService.placeOrder(customerId, sku, quantity, cardNumber) !! PaymentDeclinedError
  #1.1 - InventoryService.reserve(sku, quantity)
  #1.2 - PaymentService.charge(customerId, amountCents, card) !! PaymentDeclinedError
```
<!-- /snippet -->

(The run that produces this page points `approvedDir` under
`narrativetrace-output/`, because the tests that write a page may not write
into the source tree. In your project it is `narratives/`, beside the
baseline.)

## How to read it

- **The first line names the change, not just the fact of it:**
  `-1 call InventoryService.release`. One call fewer, and which one.
- **The diff body is the pinned shape with the dropped line marked.** `#1`,
  `#1.1` and `#1.2` are unchanged and unmarked; `-  #1.3 - InventoryService.release(sku, quantity)`
  is the behaviour that left. A reviewer who has never seen this code can tell
  what the refactoring did from four lines.
- **The assertions still passed.** The failure is the approval's, which is the
  point: the test asserts that no order is saved, and the refactoring did not
  break that. Nothing in the test ever looked at the release, and nothing had
  to.
- **Now decide.** If dropping the release is intended — the caller took it
  over, say — run `npx narrativetrace-approve`, review the diff in the
  promoted file, and commit it: the new shape becomes the pinned one. If it is
  not intended, you have just caught the bug that
  [Help me debug and fix this bug](help-me-debug-and-fix-this-bug.md) fixed,
  on its way back in. Either way the decision is recorded in the repository,
  by a human, in a file a reviewer can read. A `.received.nt` left behind once
  you have resolved it is what `narrativetrace-doctor` reports.
- **The baseline is value-free**, so approving it leaks nothing and a change
  in test data never makes it fail: `(customerId, sku, quantity, cardNumber)`
  are names, `!! PaymentDeclinedError` is an outcome.

## What is not captured

- **This is a structural comparison: the same calls, in the same order, with
  the same outcomes.** It is not a proof that every value is equal. A
  refactoring that charges 7998 where it charged 3999, with every call in
  place, passes this gate — that is what your assertions are for, and the
  `detail` artifact is where you would see it.
- **Only the calls the integration intercepts.** A dropped private call, or
  one between two unwrapped classes, is invisible to the baseline exactly as
  it is to the trace.
- **A test that does not run is not compared.** Approval protects the
  scenarios you pinned; a flow with no test has no baseline, and deleting a
  test deletes its gate — its `.approved.nt` is then an orphan that nothing
  compares against.
- **Timings are never part of it.** The baseline carries no durations, so it
  cannot catch a change that only made the flow slower.

**The skill for this:** `narrativetrace-verify` — it reads the structural
trace against the intent of the change and pins the flow as a baseline behind
your yes.
