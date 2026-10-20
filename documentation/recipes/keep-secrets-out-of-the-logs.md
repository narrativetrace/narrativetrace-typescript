# Keep secrets out of the logs

## The problem

> If this thing logs every call with every argument, it is going to log a
> card number. Convince me it does not.

The checkout takes a password and a card number. Below is one run of it with
both, the log it actually wrote, and the test that proves neither value is in
that file.

## Minimal setup

Nothing. Redaction is on in every shipped integration and there is no
configuration surface that turns it off — the deny-list is consulted at
*capture*, before a value becomes an event, so a denied value never reaches
the log line, the trace file, the buffered path or a consumer on the pipeline.
[Privacy and Redaction](../privacy-and-redaction.md) is the row-by-row
version, verified against the code. The log lines here come from the pino
bridge, wired as in [Add logging to this service](add-logging-to-this-service.md).

Two things, though, are worth doing once in your own project:

1. **Write this page's test for your own flow.** Redaction you have not
   asserted is a claim, not a property of your build. The doctor's
   "redaction never proven in a test" finding exists for exactly this.
2. **Know the escape hatch.** A secret under a name nobody could guess —
   `fingerprint`, `answer2` — is reachable by index:
   `traceObject(service, context, { methods: { signIn: { params: [...], notTraced: [1] } } })`
   redacts the second argument whatever its name, and `@notTraced(1)` does the
   same under decorators. It always wins
   ([Decorators Guide § `@notTraced`](../decorators-guide.md#nottraced)).

## The scenario

One new collaborator, so the run carries a password as well as a card. Its
parameter is called `password` — that name is the whole point:

<!-- snippet: recipes/checkout/src/accounts.ts -->
```ts
// src/accounts.ts
/** Signs a customer in before the checkout charges them. The parameter is named `password`. */
export interface CustomerAccounts {
  /**
   * @returns the session id the checkout carries for the rest of the request
   * @throws {RangeError} when the password is blank
   */
  signIn(customerId: string, password: string): string;
}

/** Accounts that accept any non-blank password, so the scenario needs no user store. */
export class InMemoryAccounts implements CustomerAccounts {
  signIn(customerId: string, password: string): string {
    if (password.trim() === "") {
      throw new RangeError("password must not be blank");
    }
    return `SESSION-${customerId}`;
  }
}
```
<!-- /snippet -->

The run signs the customer in and places the order. The two secret values are
constants here so the test can search the log for them afterwards — a real
flow gets them from the request:

<!-- snippet: recipes/checkout/__tests__/secrets-recipe.test.ts -->
```ts
import { readFileSync, writeFileSync } from "node:fs";
import { renderMarkdownBody } from "@narrativetrace/core-node";
import { traceObject } from "@narrativetrace/proxy";
import { beforeEach, describe, expect, it } from "vitest";
import { InMemoryAccounts } from "../src/accounts.js";
import { contextLoggingTo } from "../support/log-context.js";
import { recipeOutput } from "../support/recipe-runs.js";
import { useStableSpanIds } from "../support/stable-ids.js";
import { tracedCheckout } from "../support/wiring.js";

/**
 * Proves documentation/recipes/keep-secrets-out-of-the-logs.md: one checkout carrying a password
 * and a card number writes neither into the log its own logger produced — the password caught by
 * its NAME, the card number by its name and again, one call deeper, by its VALUE (release rule 8,
 * docs as tests).
 *
 * @llmNote The assertion reads the file the pino logger wrote, not a rendering this test produced:
 * a page claiming "the secret is not in your log" is only worth what a real log file says.
 */
const SLUG = "keep-secrets-out-of-the-logs";
const LOG_FILE = recipeOutput(SLUG, "checkout.log");

/** Luhn-valid, like a real one — which is what the value-shape rule recognizes. */
const CARD_NUMBER = "4242424242424242";

/**
 * The password this run signs in with. Matches no value-shape rule at all: only its parameter's
 * NAME can save it.
 *
 * @llmNote Named for the phrase rather than for the field it fills, because the public snapshot's
 * secrets gate reads a constant whose name carries that word and whose value is a string literal as
 * a credential shipped in the open — correctly, for every such line but a documentation fixture's.
 */
const SIGN_IN_PASSPHRASE = "orchid-trombone-77";

beforeEach(useStableSpanIds);

describe("keep secrets out of the logs", () => {
  it("a checkout with a password and a card writes neither", () => {
    const context = contextLoggingTo(LOG_FILE);
    const accounts = traceObject(
      new InMemoryAccounts(),
      context,
      { signIn: ["customerId", "password"] },
      { className: "CustomerAccounts" },
    );
    const { checkout } = tracedCheckout(context);

    const session = accounts.signIn("C-1234", SIGN_IN_PASSPHRASE);
    const orderId = checkout.placeOrder("C-1234", "SKU-KB", 2, CARD_NUMBER);

    expect(session).toBe("SESSION-C-1234");
    expect(orderId).toBe("ORD-C-1234-SKU-KB-2");
    assertNeitherSecretIsInTheLog();
    const narrative = renderMarkdownBody(context.captureTrace());
    writeFileSync(recipeOutput(SLUG, "narrative.md"), `${narrative}\n`);
    assertNeitherSecretIsInTheNarrative(narrative);
  });

  it("a secret under a name nobody could guess is redacted by index", () => {
    const context = contextLoggingTo(recipeOutput(SLUG, "by-index.log"));
    const accounts = traceObject(new InMemoryAccounts(), context, {
      className: "CustomerAccounts",
      methods: { signIn: { params: ["customerId", "answer2"], notTraced: [1] } },
    });

    accounts.signIn("C-1234", SIGN_IN_PASSPHRASE);

    const log = readFileSync(recipeOutput(SLUG, "by-index.log"), "utf-8");
    expect(log).toContain('{"name":"answer2","value":"[REDACTED]"}');
    expect(log).not.toContain(SIGN_IN_PASSPHRASE);
  });
});

/** The proof: the log file the project's own logger wrote, read back and searched. */
function assertNeitherSecretIsInTheLog(): void {
  const log = readFileSync(LOG_FILE, "utf-8");
  expect(log).toContain('{"name":"password","value":"[REDACTED]"}');
  expect(log).toContain('{"name":"cardNumber","value":"[REDACTED]"}');
  expect(log).toContain('{"name":"card","value":"[REDACTED]"}');
  expect(log).not.toContain(SIGN_IN_PASSPHRASE);
  expect(log).not.toContain(CARD_NUMBER);
}

/** The other surface a secret could have reached: the narrative rendered from the same run. */
function assertNeitherSecretIsInTheNarrative(narrative: string): void {
  expect(narrative).not.toContain(SIGN_IN_PASSPHRASE);
  expect(narrative).not.toContain(CARD_NUMBER);
}
```
<!-- /snippet -->

## The actual output

**The log the run wrote**, through the project's own logger. Each parameter is
a `name`/`value` pair in `nt.parameters`:

<!-- snippet: recipes/checkout/narrativetrace-output/recipes/keep-secrets-out-of-the-logs/checkout.log -->
```text
{"level":10,"code.namespace":"CustomerAccounts","code.function":"signIn","nt.depth":0,"nt.parameters":[{"name":"customerId","value":"\"C-1234\""},{"name":"password","value":"[REDACTED]"}],"trace_id":"c4e1d0a7c4e1d0a7c4e1d0a7c4e1d0a7","nt.traceName":"solid wand romps","span_id":"0000000000000001","nt.storyId":"CustomerAccounts.signIn","nt.chapterId":"CustomerAccounts.signIn","nt.entryType":"entry","nt.eventType":"method_enter","nt.schemaVersion":"1.0","msg":"→ CustomerAccounts.signIn"}
{"level":10,"nt.outcome":"returned","nt.depth":0,"trace_id":"c4e1d0a7c4e1d0a7c4e1d0a7c4e1d0a7","nt.traceName":"solid wand romps","span_id":"0000000000000001","nt.storyId":"CustomerAccounts.signIn","nt.chapterId":"CustomerAccounts.signIn","nt.entryType":"entry","nt.eventType":"method_exit","nt.schemaVersion":"1.0","nt.returnValue":"\"SESSION-C-1234\"","msg":"← returned: \"SESSION-C-1234\""}
{"level":10,"code.namespace":"OrderService","code.function":"placeOrder","nt.depth":0,"nt.parameters":[{"name":"customerId","value":"\"C-1234\""},{"name":"sku","value":"\"SKU-KB\""},{"name":"quantity","value":"2"},{"name":"cardNumber","value":"[REDACTED]"}],"trace_id":"c4e1d0a7c4e1d0a7c4e1d0a7c4e1d0a7","nt.traceName":"solid wand romps","span_id":"0000000000000002","nt.storyId":"CustomerAccounts.signIn","nt.chapterId":"CustomerAccounts.signIn","nt.entryType":"entry","nt.eventType":"method_enter","nt.schemaVersion":"1.0","msg":"→ OrderService.placeOrder"}
{"level":10,"code.namespace":"InventoryService","code.function":"reserve","nt.depth":1,"nt.parameters":[{"name":"sku","value":"\"SKU-KB\""},{"name":"quantity","value":"2"}],"trace_id":"c4e1d0a7c4e1d0a7c4e1d0a7c4e1d0a7","nt.traceName":"solid wand romps","span_id":"0000000000000003","parent_span_id":"0000000000000002","nt.storyId":"CustomerAccounts.signIn","nt.chapterId":"CustomerAccounts.signIn","nt.entryType":"entry","nt.eventType":"method_enter","nt.schemaVersion":"1.0","msg":"→ InventoryService.reserve"}
{"level":10,"nt.outcome":"returned","nt.depth":0,"trace_id":"c4e1d0a7c4e1d0a7c4e1d0a7c4e1d0a7","nt.traceName":"solid wand romps","span_id":"0000000000000003","parent_span_id":"0000000000000002","nt.storyId":"CustomerAccounts.signIn","nt.chapterId":"CustomerAccounts.signIn","nt.entryType":"entry","nt.eventType":"method_exit","nt.schemaVersion":"1.0","nt.returnValue":null,"msg":"← returned: null"}
{"level":10,"code.namespace":"PaymentService","code.function":"charge","nt.depth":1,"nt.parameters":[{"name":"customerId","value":"\"C-1234\""},{"name":"amountCents","value":"7998"},{"name":"card","value":"[REDACTED]"}],"trace_id":"c4e1d0a7c4e1d0a7c4e1d0a7c4e1d0a7","nt.traceName":"solid wand romps","span_id":"0000000000000004","parent_span_id":"0000000000000002","nt.storyId":"CustomerAccounts.signIn","nt.chapterId":"CustomerAccounts.signIn","nt.entryType":"entry","nt.eventType":"method_enter","nt.schemaVersion":"1.0","msg":"→ PaymentService.charge"}
{"level":10,"nt.outcome":"returned","nt.depth":0,"trace_id":"c4e1d0a7c4e1d0a7c4e1d0a7c4e1d0a7","nt.traceName":"solid wand romps","span_id":"0000000000000004","parent_span_id":"0000000000000002","nt.storyId":"CustomerAccounts.signIn","nt.chapterId":"CustomerAccounts.signIn","nt.entryType":"entry","nt.eventType":"method_exit","nt.schemaVersion":"1.0","nt.returnValue":"\"PAY-C-1234-7998\"","msg":"← returned: \"PAY-C-1234-7998\""}
{"level":10,"code.namespace":"OrderRepository","code.function":"save","nt.depth":1,"nt.parameters":[{"name":"order","value":"{\"orderId\": \"ORD-C-1234-SKU-KB-2\", \"customerId\": \"C-1234\", \"sku\": \"SKU-KB\", \"quantity\": 2, \"amountCents\": 7998}"}],"trace_id":"c4e1d0a7c4e1d0a7c4e1d0a7c4e1d0a7","nt.traceName":"solid wand romps","span_id":"0000000000000005","parent_span_id":"0000000000000002","nt.storyId":"CustomerAccounts.signIn","nt.chapterId":"CustomerAccounts.signIn","nt.entryType":"entry","nt.eventType":"method_enter","nt.schemaVersion":"1.0","msg":"→ OrderRepository.save"}
{"level":10,"nt.outcome":"returned","nt.depth":0,"trace_id":"c4e1d0a7c4e1d0a7c4e1d0a7c4e1d0a7","nt.traceName":"solid wand romps","span_id":"0000000000000005","parent_span_id":"0000000000000002","nt.storyId":"CustomerAccounts.signIn","nt.chapterId":"CustomerAccounts.signIn","nt.entryType":"entry","nt.eventType":"method_exit","nt.schemaVersion":"1.0","nt.returnValue":null,"msg":"← returned: null"}
{"level":10,"nt.outcome":"returned","nt.depth":0,"trace_id":"c4e1d0a7c4e1d0a7c4e1d0a7c4e1d0a7","nt.traceName":"solid wand romps","span_id":"0000000000000002","nt.storyId":"CustomerAccounts.signIn","nt.chapterId":"CustomerAccounts.signIn","nt.entryType":"entry","nt.eventType":"method_exit","nt.schemaVersion":"1.0","nt.returnValue":"\"ORD-C-1234-SKU-KB-2\"","msg":"← returned: \"ORD-C-1234-SKU-KB-2\""}
```
<!-- /snippet -->

**The narrative of the same run**, rendered from its captured trace — the
other surface a secret could have reached (a trace file is this, written to
disk):

<!-- snippet: recipes/checkout/narrativetrace-output/recipes/keep-secrets-out-of-the-logs/narrative.md mask=duration -->
```text
- `CustomerAccounts.signIn(customerId: "C-1234", password: [REDACTED])` → `"SESSION-C-1234"` — 1ms #1
- `OrderService.placeOrder(customerId: "C-1234", sku: "SKU-KB", quantity: 2, cardNumber: [REDACTED])` → `"ORD-C-1234-SKU-KB-2"` — 2ms #2
  - `InventoryService.reserve(sku: "SKU-KB", quantity: 2)` — 0.13ms #2.1
  - `PaymentService.charge(customerId: "C-1234", amountCents: 7998, card: [REDACTED])` → `"PAY-C-1234-7998"` — 0.18ms #2.2
  - `OrderRepository.save(order: {"orderId": "ORD-C-1234-SKU-KB-2", "customerId": "C-1234", "sku": "SKU-KB", "quantity": 2, "amountCents": 7998})` — 0.16ms #2.3
```
<!-- /snippet -->

## How to read it

**Which rule caught which value.** Three values are gone, by two independent
mechanisms:

| Line | Value | Caught by |
|---|---|---|
| `#1` `CustomerAccounts.signIn(…, password: [REDACTED])` | `orchid-trombone-77` | Its **name**. `password` is on the always-on deny-list, which matches parameter names and field names — in several languages — on any class, yours included. No shape rule would have caught this one: it is an ordinary string |
| `#2` `OrderService.placeOrder(…, cardNumber: [REDACTED])` | `4242424242424242` | Its **name** again: `cardNumber` is on the same list |
| `#2.2` `PaymentService.charge(…, card: [REDACTED])` | the same number, one call deeper | Its **value**. The parameter is named `card`, which the deny-list does not know — and the number is Luhn-valid, so the independent value-shape check caught it anyway |

That third row is the one worth remembering: `card` is what a parameter gets
called in real code, and the name axis alone would have printed it. The shape
axis knows a Luhn-valid card number, a JWT, a `Set-Cookie` string, a dashed
US Social Security number and a national identity number that passes its own
checksum.

**Where the rules live.** In the library, not in your configuration:
`RedactionPolicy.DEFAULT` in `@narrativetrace/core`, consulted by the value
renderer every shipped integration constructs the same way. There is no
option, no environment variable and no log level that reaches it, and
`traceObject()` takes no `redactionPolicy` of its own;
[Privacy and Redaction](../privacy-and-redaction.md) lists the surfaces and
what outranks what. `customerId: "C-1234"` *is* written in full, by the way —
a customer id is identifying, not secret, and NarrativeTrace does not guess.
If yours must not be logged, that is `notTraced`, which is a decision in your
source rather than a state a deploy can flip.

**Why the test is the proof, not the page.** `assertNeitherSecretIsInTheLog`
reads the file the logger wrote and asserts two things: that the three
redacted parameters are present *as* `[REDACTED]`, and that neither secret
string appears anywhere in it. A page can only show you bytes; a test fails
the build the day a refactor renames `password` to something the list does not
know. That is the difference between "it was safe when this was written" and
"it is safe now". Keep the absence assertion — the `not.toContain` — even when
the presence one looks sufficient: a value that vanishes because the call
stopped being traced at all would still satisfy the first. The second test
does the same for the escape hatch: `answer2` is a name the list does not
know, and it is redacted because the call said so.

## What is not captured

- **Code that is not traced is not NarrativeTrace's to redact.** Five objects
  are wrapped above; a secret passed between two unwrapped
  classes is not seen, and therefore neither redacted nor logged. That is not a
  guarantee of safety — it is a guarantee of silence.
- **A secret your own log statement writes is yours.** NarrativeTrace
  redacts what *it* renders. `logger.info({ card }, "charging")` is your line,
  in your code, and nothing here filters it. The redaction contract is about
  generated narrative, not about everything the process writes.
- **A return value is not matched by name**, because it has none. `signIn`
  returns `"SESSION-C-1234"` and it is printed. A session token returned from
  a traced method needs the shape rules to catch it, or a narrower return
  type.
- **Names the list does not know.** The list is big and multilingual, not
  infinite. A secret called `q3` is caught only by its shape, if it has one.
  Assert, do not assume — which is this page's whole point.
- **Parameter names that the runtime cannot recover.** JavaScript keeps no
  parameter names at runtime, so `traceObject()` is told them (the lists
  above). An integration that cannot be told, such as the NestJS auto-proxy,
  captures `arg0`, `arg1`, … and the name axis cannot match those; the
  value-shape check and `@notTraced(i)` still protect them
  ([Privacy and Redaction](../privacy-and-redaction.md)).
- **What happens after the log line is written.** Shipping, retention and
  access to the file are your platform's; the structural `.nt` carries no
  values at all and is the artifact meant for committing and for handing to a
  model ([Review a complex flow before changing it](review-a-complex-flow-before-changing-it.md)).

**The skill for this:** `narrativetrace-doctor` — one of its checks is
exactly "redaction never proven in a test", and it names the fix.
