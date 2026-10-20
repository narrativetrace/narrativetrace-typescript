# Trace in production without the cost

## The problem

> I want this in production for the requests that go wrong. I am not paying
> for a full trace of every request that goes right.

That is one setting — the tracing level — and this page is the same run seen
through it twice: the declined-payment checkout at `detail`, where every value
is captured, and at `errors`, where only runs that failed survive at all.

## Minimal setup

One level, set wherever your deployment is configured. All of these say the
same thing:

```bash
# the environment — the usual place for a deployment to set it
NARRATIVETRACE_LEVEL=errors node server.js
```

```jsonc
// narrativetrace.config.json — a project file, below the environment in precedence
{ "level": "errors" }
```

```ts
// or in code, which wins over both
const config = new NarrativeTraceConfig("errors"); // "off" | "errors" | "summary" | "narrative" | "detail"
```

The level is NarrativeTrace's own dial and it sits at the front: a call it
filters out never becomes an event, for any consumer. Your logger's level is a
second, independent dial that decides what is *printed* —
[FAQ, "Two dials, two paths"](../faq.md) is the long version, and the
distinction matters here because raising a logger level saves you log volume
while changing nothing about capture. Where each setting comes from and which
wins: [Configuration Guide § 1](../configuration-guide.md#1-tracing-levels-narrativetraceconfig)
and [§ 2b](../configuration-guide.md#2b-where-settings-come-from).

## The scenario

The run is the declined-payment reproduction from
[Help me debug and fix this bug](help-me-debug-and-fix-this-bug.md) —
`reserve`, then `charge` throwing, then `release` — reused unchanged, because
the subject of this page is the dial and not another flow. The driver below
runs it at both levels in real, nested Vitest processes, and runs a
*successful* checkout at `errors` as well:

<!-- snippet: recipes/checkout/__tests__/cost-recipe.test.ts -->
```ts
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { beforeAll, describe, expect, it } from "vitest";
import { recipeOutput, runFixture, writeNarrativeBody } from "../support/recipe-runs.js";

/**
 * Proves documentation/recipes/trace-in-production-without-the-cost.md: the SAME declined-payment
 * run, captured once at `detail` and once at `errors`, writes the two artifacts that page embeds —
 * `errors` keeps the failed run whole and drops every parameter value, and a successful run at
 * `errors` writes no artifact at all (release rule 8, docs as tests).
 *
 * @llmNote The scenario is `declined-payment-fixture`'s fixed reproduction, reused rather than
 * rewritten: this page's subject is the level dial, not another flow, and a reader comparing the two
 * levels should be comparing one run's renderings. Only the passing test is selected — the
 * fixture's other test fails by design for documentation/recipes/help-me-debug-and-fix-this-bug.md.
 */
const SLUG = "trace-in-production-without-the-cost";
const DECLINED = {
  fixture: "declined-payment-fixture",
  scenario: "the_stock_is_released_when_the_card_is_declined",
  testPattern: "declined$",
};
const SUCCESSFUL = {
  fixture: "checkout-review-fixture",
  scenario: "a_customer_buys_two_keyboards",
};
const CALLS_OF_THE_FAILED_RUN = [
  "OrderService.placeOrder",
  "InventoryService.reserve",
  "PaymentService.charge",
  "InventoryService.release",
];

interface Scenario {
  readonly fixture: string;
  readonly scenario: string;
  readonly testPattern?: string;
}

/** One nested, real Vitest run of `scenario` into `<slug>/<directory>` at `level` (absent: detail). */
function capture(scenario: Scenario, directory: string, level?: string): string {
  const output = recipeOutput(SLUG, directory);
  const run = runFixture(join("fixtures", `${scenario.fixture}.ts`), output, {
    ...(level ? { settings: { NARRATIVETRACE_LEVEL: level } } : {}),
    ...(scenario.testPattern ? { testPattern: scenario.testPattern } : {}),
  });
  expect(run.exitCode).toBe(0);
  return output;
}

/** The narrative a run wrote, without its per-run frontmatter, as the page embeds it. */
function narrativeOf(output: string, scenario: Scenario): string {
  return writeNarrativeBody(
    join(output, scenario.fixture, `${scenario.scenario}.md`),
    join(output, "narratives", `${scenario.scenario}.md`),
  );
}

describe("trace in production without the cost", () => {
  let detail: string;
  let errors: string;
  let successfulAtDetail: string;
  let successfulAtErrors: string;

  beforeAll(() => {
    detail = narrativeOf(capture(DECLINED, "detail"), DECLINED);
    errors = narrativeOf(capture(DECLINED, "errors", "errors"), DECLINED);
    successfulAtDetail = capture(SUCCESSFUL, "detail-successful");
    successfulAtErrors = capture(SUCCESSFUL, "errors-successful", "errors");
  }, 60_000);

  it("errors keeps the failed run whole", () => {
    for (const call of CALLS_OF_THE_FAILED_RUN) {
      expect(errors).toContain(call);
    }
  });

  it("a successful run writes no artifact at errors and does at detail", () => {
    // The control: the same path IS written when the level keeps successful runs, so the
    // absence is the level's doing and not a path that was never right.
    expect(existsSync(join(successfulAtDetail, SUCCESSFUL.fixture))).toBe(true);
    expect(existsSync(join(successfulAtErrors, SUCCESSFUL.fixture))).toBe(false);
    expect(readdirSync(successfulAtErrors)).toEqual(["vitest-report.json"]);
  });

  it("detail carries the values errors suppresses", () => {
    expect(detail).toContain('customerId: "C-1234"');
    expect(errors).not.toContain("C-1234");
  });

  it("both levels still redact the card number", () => {
    for (const narrative of [detail, errors]) {
      expect(narrative).toContain("[REDACTED]");
      expect(narrative).not.toContain("4000000000000002");
    }
  });

  it("writes a structural trace at errors that carries no values", () => {
    const structural = readFileSync(
      join(recipeOutput(SLUG, "errors"), "structural", DECLINED.fixture, `${DECLINED.scenario}.nt`),
      "utf-8",
    );

    expect(structural).toContain("InventoryService.release(sku, quantity)");
    expect(structural).not.toContain("C-1234");
  });
});
```
<!-- /snippet -->

## The actual output

**At `detail`**, the declined run, every value captured (shown without its
frontmatter, which carries the run's name, a fresh trace id and a wall-clock
duration that differ on every run):

<!-- snippet: recipes/checkout/narrativetrace-output/recipes/trace-in-production-without-the-cost/detail/narratives/the_stock_is_released_when_the_card_is_declined.md mask=duration -->
```text
- `OrderService.placeOrder(customerId: "C-1234", sku: "SKU-KB", quantity: 2, cardNumber: [REDACTED])` ❌ `PaymentDeclinedError`: card declined by the issuer — 0.81ms #1
  - `InventoryService.reserve(sku: "SKU-KB", quantity: 2)` — 0.09ms #1.1
  - `PaymentService.charge(customerId: "C-1234", amountCents: 7998, card: [REDACTED])` ❌ `PaymentDeclinedError`: card declined by the issuer — 0.1ms #1.2
  - `InventoryService.release(sku: "SKU-KB", quantity: 2)` — 0.02ms #1.3
```
<!-- /snippet -->

**At `errors`**, the same run of the same code:

<!-- snippet: recipes/checkout/narrativetrace-output/recipes/trace-in-production-without-the-cost/errors/narratives/the_stock_is_released_when_the_card_is_declined.md mask=duration -->
```text
- `OrderService.placeOrder(customerId: , sku: , quantity: , cardNumber: [REDACTED])` ❌ `PaymentDeclinedError`: card declined by the issuer — 0.72ms #1
  - `InventoryService.reserve(sku: , quantity: )` — 0.13ms #1.1
  - `PaymentService.charge(customerId: , amountCents: , card: )` ❌ `PaymentDeclinedError`: card declined by the issuer — 0.09ms #1.2
  - `InventoryService.release(sku: , quantity: )` — 0.02ms #1.3
```
<!-- /snippet -->

**And at `errors`, a checkout that succeeded**: no artifact at all. There is
nothing to embed, which is the whole point — the driver above asserts both
halves of that claim, the directory's absence at `errors` and its presence at
`detail`, so the emptiness is the level's doing and not a path that was never
right.

## How to read it

- **What `errors` keeps.** The failed run, whole. `#1` threw, and an error
  node's subtree is kept intact — so `reserve` (`#1.1`), `charge` (`#1.2`) and
  `release` (`#1.3`) are all still there, including the two calls that
  returned normally. That is deliberate: the calls around a failure are what
  you need to diagnose it, and dropping the successful sibling would leave you
  with an exception and no story. A call that returned *and* leads to no
  failure anywhere below it is dropped, and a root with no failure in its
  whole subtree is dropped entirely — which is why the successful checkout
  wrote nothing.
- **What `errors` drops.** Every parameter value:
  `customerId: , sku: , quantity: `. The empty space after each name is suppression at *capture* —
  the value was never rendered, so it cannot be recovered from these events
  afterwards, at any later level. What survives is the shape, the outcomes and
  the exception, and `cardNumber: [REDACTED]` is still redacted because
  redaction is a different decision from suppression.
- **The pruning happens after capture, not instead of it.** Every call was
  intercepted and every event was published; the tree builder then built the
  tree and removed what the level does not keep. That is the honest shape of
  the cost: `errors` is cheaper than `detail` because values are not rendered
  — the expensive part — not because calls go unintercepted.
- **Only `off` skips interception.** At `off` the proxy returns before any
  argument, event or publish happens, and nothing downstream can bring the
  call back. `errors`, `summary` and `narrative` all still intercept every
  call and publish an entry and an exit for it. If the question is "what does
  tracing cost in this hot loop", the answer is a different level for that
  scope, or `off`.
- **The numbers.** The measured figures — the cost of a call with tracing on
  but `off`, and of a fully captured one — are in the
  [README's Performance section](../../README.md#performance), with the date,
  the Node version and the harness they come from. They are not repeated here,
  because one copy that moves with the measurements is worth more than two that
  disagree.

## What is not captured

- **The published figures are measurements, not a promise.** They were taken
  on the harness and hardware the README names. Your numbers depend on your
  Node version, your hardware, your parameter shapes (a deep object graph
  renders for longer than a number) and how much of your code is traced.
  Measure the level you intend to run.
- **A level is not a privacy control.** `errors` happens to write fewer values
  because it suppresses them, but suppression and redaction are different
  mechanisms with different guarantees:
  [Keep secrets out of the logs](keep-secrets-out-of-the-logs.md) is the one
  that holds at every level.
- **Nothing here changes how much your logger writes.** Each captured event is
  still offered to the live consumers, so the logger's own level is what
  decides log volume: `cost-logger-dial.test.ts` in the same project runs a
  successful checkout at `errors` and finds the captured trace empty and all
  eight log lines written. Two dials.
- **A level cannot be raised retroactively.** Values not captured are gone;
  reproducing the run at `detail` is the only way back, which is what the
  debugging recipe does.
- **Per-scope levels are not shown here.** This page sets one level for a
  whole run. Narrowing the traced scope instead — which objects are wrapped at
  all — is the other half of the cost question, and belongs to
  [Choosing an Integration](../choosing-an-integration.md).

**The skill for this:** `narrativetrace-doctor` — it reports the level a
project is actually running at, which is the first thing to check when a
trace is thinner than expected.
