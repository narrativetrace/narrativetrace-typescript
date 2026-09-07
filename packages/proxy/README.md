# @narrativetrace/proxy

ES `Proxy`-based tracing for NarrativeTrace — wrap any object to capture its method calls, plus the `@traced`/`@narrated`/`@onError`/`@notTraced` decorators.

## Install

```bash
pnpm add @narrativetrace/proxy @narrativetrace/core
```

`@narrativetrace/core` is a peer dependency — install it alongside `proxy`.

## Usage

`traceObject` returns a transparent proxy: calls run normally, but their names,
parameters, return values, and errors are recorded into the context.

```ts
import { NarrativeTraceConfig, SyncNarrativeContext, renderMarkdown } from "@narrativetrace/core";
import { traceObject, traced, onError } from "@narrativetrace/proxy";

class PaymentService {
  @traced("customerId", "amount")
  @onError("Payment declined for customer {customerId}")
  charge(customerId: string, amount: number) {
    return { transactionId: "TX-1", amount };
  }
}

const context = new SyncNarrativeContext(new NarrativeTraceConfig());
const payments = traceObject(new PaymentService(), context);

payments.charge("C1", 59.98);

console.log(renderMarkdown(context.captureTrace()));
```

## Note — purity contract

To render captured values the proxy may invoke a small, fixed set of members on your
arguments and return values: a custom `toString()`, a `@narrativeSummary` method, and any
property path named in a `@narrated`/`@onError` template. Keep those **pure** — free of
side effects such as lazy loading, counters, cache population, or I/O — exactly as you
would for a debugger or serializer. Every invocation is bounded and exception-isolated, and
with tracing off nothing on your objects is touched. Redact members you cannot make pure
via `@notTraced` or `static notTraced`.

## Learn more

- [Decorators guide](../../documentation/decorators-guide.md)
- [Configuration guide](../../documentation/configuration-guide.md)
- [Project README](../../README.md)
