# Why did this test fail

## The problem

> Why did this test fail?

One checkout test is red. The assertion says what did not match; it does not
say what the code did on the way there, which is the part you need in order
to know whether the code or the expectation is wrong.

## Minimal setup

Nothing beyond the [install](../installation-guide.md) and
`@narrativetrace/vitest`. The `createNarrativeTest` fixture writes one
narrative per test with no configuration — for a failing test too, which is
the case this page is about. The files land in
`narrativetrace-output/<test file>/<scenario>.md`: the test file's name without
its extension, then the test's title with every space an underscore.

## The scenario

The failing test:

<!-- snippet: recipes/checkout/fixtures/stale-expectation-fixture.ts -->
```ts
// fixtures/stale-expectation-fixture.ts
import { createNarrativeTest } from "@narrativetrace/vitest";
import { expect } from "vitest";
import { tracedCheckout } from "../support/wiring.js";

const test = createNarrativeTest();

/**
 * The failing checkout test documentation/recipes/why-did-this-test-fail.md is read through. It
 * fails on an assertion, by design, which is why it is a fixture: the project's own config never
 * collects `*-fixture.ts`, and `__tests__/test-failure-recipe.test.ts` runs it in a nested Vitest
 * process and writes down what the run reported.
 *
 * @llmNote Nothing here says which side is wrong — that is the reader's exercise, and the
 * narrative the run writes is what settles it. Do not add a comment that gives it away.
 */
test("the customer gets an order id for their keyboards", ({ narrativeContext }) => {
  const { checkout } = tracedCheckout(narrativeContext);

  const orderId = checkout.placeOrder("C-1234", "SKU-KB", 2, "4242424242424242");

  expect(orderId).toBe("ORD-C-1234-SKU-KB-1");
});
```
<!-- /snippet -->

## The actual output

What the runner reported:

<!-- snippet: recipes/checkout/narrativetrace-output/recipes/why-did-this-test-fail/assertion-failure.txt -->
```text
AssertionError: expected 'ORD-C-1234-SKU-KB-2' to be 'ORD-C-1234-SKU-KB-1' // Object.is equality
```
<!-- /snippet -->

And what the same run wrote beside it, at
`narrativetrace-output/stale-expectation-fixture/the_customer_gets_an_order_id_for_their_keyboards.md`
(shown without its frontmatter, which carries the run's name, a fresh trace id
and a wall-clock duration that differ on every run):

<!-- snippet: recipes/checkout/narrativetrace-output/recipes/why-did-this-test-fail/narratives/the_customer_gets_an_order_id_for_their_keyboards.md mask=duration -->
```text
- `OrderService.placeOrder(customerId: "C-1234", sku: "SKU-KB", quantity: 2, cardNumber: [REDACTED])` → `"ORD-C-1234-SKU-KB-2"` — 2ms #1
  - `InventoryService.reserve(sku: "SKU-KB", quantity: 2)` — 0.15ms #1.1
  - `PaymentService.charge(customerId: "C-1234", amountCents: 7998, card: [REDACTED])` → `"PAY-C-1234-7998"` — 0.08ms #1.2
  - `OrderRepository.save(order: {"orderId": "ORD-C-1234-SKU-KB-2", "customerId": "C-1234", "sku": "SKU-KB", "quantity": 2, "amountCents": 7998})` — 0.03ms #1.3
```
<!-- /snippet -->

## How to read it

Read the narrative top-down against the assertion, one span at a time:

- `#1 OrderService.placeOrder(... quantity: 2 ...) → "ORD-C-1234-SKU-KB-2"`.
  The value the assertion rejected is right there, and so is the input that
  produced it: the call asked for **two** keyboards.
- `#1.1 InventoryService.reserve(sku: "SKU-KB", quantity: 2)` — two units
  reserved, consistent with the call.
- `#1.2 PaymentService.charge(..., amountCents: 7998, ...)` — 7998 is two
  units at 3999, so the price agrees with the quantity too.
- `#1.3 OrderRepository.save(order: {... "quantity": 2 ...})` — what was
  stored agrees with what was asked for.
- No span carries a `❌`: the assertion failed, the code did not. Every span
  completed and nothing threw — the run is red because of what the *test*
  said, which only the runner's message reports.

Every span agrees with every other span and with the call that started them.
The expectation — `ORD-C-1234-SKU-KB-1` — is the only thing in the run that
says one keyboard, so it is the thing that is out of date; the fixture it was
written against has since changed to order two. The fix is in the test.

The opposite reading is the other recipe: when a span *disagrees* with the
intent — a quantity that changes between two calls, a call that should have
followed and did not — the code is wrong, and
[Help me debug and fix this bug](help-me-debug-and-fix-this-bug.md) is that
walk-through.

## What is not captured

- **Only that test's run.** The narrative is written per test, per run. A
  failure that happens once in twenty runs needs one of those runs to be the
  one that wrote the file; each run overwrites the last one's file, and the
  value-free `.nt` of a failing run is not advanced at all.
- **The assertion is not in the trace.** The two outputs above come from two
  places — the runner reported the mismatch, the fixture wrote the flow — and
  nothing correlates them automatically beyond the scenario name.
- **A value a test computed but never passed to a traced call is invisible.**
  The trace carries parameters and return values of wrapped calls, not local
  variables.
- **Timings in a failing run mean nothing.** The run stopped being
  representative the moment the assertion threw.

**The skill for this:** `narrativetrace-debug` — it starts from the symptom,
reads the first span where a value diverges, and names it by span id.
