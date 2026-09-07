# First 10 minutes

One tiny service, one Vitest test, seven steps. Every command below was run
for real against this version of the repository — the file paths, the
clarity scores, and the `[REDACTED]` marker are actual output, not
illustrations. The only things that will differ on your machine are the
duration (`ms`) and the two-word `trace_name`, both generated fresh on every
run.

Node 20+ (CI runs 22), TypeScript 5.0+ (for the decorators in step 7), a project that
already runs `vitest run`. If you have not seen the bigger picture yet,
`pnpm run build && pnpm demo -- --example ecommerce --no-pause` from the
repository root is faster still — this page is for when you want to see it
against *your own* code.

## 1. Add the packages

```bash
pnpm add @narrativetrace/core-node @narrativetrace/proxy
pnpm add -D @narrativetrace/vitest
```

`core-node` re-exports everything in `@narrativetrace/core` and registers
the Node id generator — importing `@narrativetrace/core` alone throws on the
first traced call. There is no build-tool plugin to apply; the packages are
the entire dependency setup.

## 2. Add one service class

```ts
// src/order-service.ts
export class OrderService {
  placeOrder(customerId: string, productId: string, quantity: number): string {
    return `ORD-${customerId}-${productId}-${quantity}`;
  }
}
```

No interface to declare — `traceObject()` wraps the concrete object directly
with an ES `Proxy`, so there is nothing to implement against. (JDK/JVM ports
of NarrativeTrace need an interface for their dynamic proxy; this one does
not.)

## 3. Add one Vitest test

```ts
// src/order-service.test.ts
import { traceObject } from "@narrativetrace/proxy";
import { createNarrativeTest } from "@narrativetrace/vitest";
import { OrderService } from "./order-service.js";

const test = createNarrativeTest();

test("customer places order", ({ narrativeContext }) => {
  const service = traceObject(new OrderService(), narrativeContext, {
    placeOrder: ["customerId", "productId", "quantity"],
  });

  service.placeOrder("C-1234", "SKU-KB", 2);
});
```

`createNarrativeTest()` returns a Vitest `test` that injects a fresh
`narrativeContext` per test and writes trace artifacts after it finishes.
The third argument to `traceObject` — `{ placeOrder: [...] }` — supplies
parameter names, because JavaScript does not retain them at runtime; without
it, the trace shows `arg0`, `arg1`, `arg2`. (Step 7 shows the decorator form,
`@traced`, which does the same thing for a class you own.)

## 4. Run the suite

```bash
npx vitest run
```

Output lands under `narrativetrace-output/` — the default the fixture
picked because no `outputDir` was given — one file per scenario per format:

```text
narrativetrace-output/
   |
   +-- order-service/customer_places_order.md          human narrative
   +-- order-service/customer_places_order.json         same trace, JSON
   +-- diagrams/order-service/customer_places_order.mmd Mermaid sequence diagram
```

`order-service.test.ts` became the `order-service` directory (the test
*file's* name, sanitized — the platform equivalent of Java's test *class*
directory); `"customer places order"` became `customer_places_order.md` —
the test name, slugged. Nothing else to configure. Only `md`/`json`/`mmd`
are written by default; pass `formats: [...]` to `createNarrativeTest` for
`puml`, `clarity-json`, or `canonical-json` too — see the
[Installation Guide](installation-guide.md#3-configure-trace-output).

## 5. Open the narrative

`narrativetrace-output/order-service/customer_places_order.md`:

```markdown
---
type: trace
scenario: customer places order
entry_point: OrderService.placeOrder
duration_ms: 1.548
trace_id: 7919d16fd10a133f3f1ebf9f5670c502
trace_name: tidy mink roots
method_count: 1
error_count: 0
---

- `OrderService.placeOrder(customerId: "C-1234", productId: "SKU-KB", quantity: 2)` → `"ORD-C-1234-SKU-KB-2"` — 1.548ms
```

Every value in the call flow — the parameter values, the return value —
came from the call you actually made. Nothing was written by hand.

## 6. Rename `placeOrder` to `process` and watch clarity drop

Naming quality is measured, not asserted. `createNarrativeTest` also writes
`customer_places_order.clarity-json` once you add `"clarity-json"` to
`formats`. Before the rename, for this exact scenario:

```json
{
  "overallScore": 0.94,
  "methodNameScore": 0.91,
  "classNameScore": 0.96,
  "parameterNameScore": 0.95,
  "structuralScore": 1,
  "cohesionScore": 0.9,
  "issues": []
}
```

Rename the method (declaration, `paramNames` key, and call site) to
`process` and run `npx vitest run` again:

```json
{
  "overallScore": 0.79,
  "methodNameScore": 0.4,
  "classNameScore": 0.96,
  "parameterNameScore": 0.95,
  "structuralScore": 1,
  "cohesionScore": 0.9,
  "issues": [
    {
      "category": "method-name",
      "element": "OrderService.process",
      "suggestion": "Use a domain-specific verb+noun (e.g., calculateTotal, reserveInventory)",
      "severity": "MEDIUM",
      "occurrences": 1,
      "impactScore": 2
    }
  ]
}
```

Same call, same values, same everything but the name — the overall score
fell from 0.94 to 0.79, the method-name dimension alone fell from 0.91 to
0.40, and an issue appeared. A suite-wide `clarity-report.md` /
`clarity-results.json` (aggregating every scenario, with a pass/fail
threshold you set) needs one extra step — adding `ClaritySuiteReporter` to
your Vitest `reporters` — covered in the
[Clarity Guide](clarity-guide.md#producing-the-results-file-from-vitest).
Rename it back to `placeOrder` (or to something even more specific) before
continuing.

## 7. Add `@notTraced` and see redaction

```ts
// src/order-service.ts
import { notTraced, traced } from "@narrativetrace/proxy";

export class OrderService {
  @traced("customerId", "productId", "quantity", "paymentToken")
  @notTraced(3)
  placeOrder(customerId: string, productId: string, quantity: number, paymentToken: string): string {
    return `ORD-${customerId}-${productId}-${quantity}`;
  }
}
```

`@traced` replaces the `paramNames` map from step 3 — with the decorator in
place, `traceObject(new OrderService(), narrativeContext)` needs no third
argument. `@notTraced(3)` marks parameter index 3 (`paymentToken`) as
redacted. Pass a token in the test
(`service.placeOrder("C-1234", "SKU-KB", 2, "tok_live_51H8x9J")`) and run
again. The trace:

```markdown
- `OrderService.placeOrder(customerId: "C-1234", productId: "SKU-KB", quantity: 2, paymentToken: [REDACTED])` → `"ORD-C-1234-SKU-KB-2"` — 1.005ms
```

The parameter name still appears — you can see a token *was* passed — but
its value never reaches disk. See
[Privacy and Redaction](privacy-and-redaction.md) for what else redaction
covers, including field-level redaction (`static notTraced`) for objects you
don't construct one parameter at a time.

## Where to go next

| You want | Go to |
|---|---|
| A different integration path than the Vitest fixture above | [Choosing an Integration](choosing-an-integration.md) |
| The row-by-row privacy contract | [Privacy and Redaction](privacy-and-redaction.md) |
| Which generated files to commit | [What to Commit](what-to-commit.md) |
| Something above did not work as shown | [Troubleshooting](troubleshooting.md) |
| Every configuration knob | [Configuration Guide](configuration-guide.md) |
