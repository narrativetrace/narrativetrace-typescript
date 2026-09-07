# NarrativeTrace TypeScript Decorators Guide

This guide lists all decorators available in NarrativeTrace TypeScript and explains when and how to use each one.

NarrativeTrace follows a **Code is the Log** philosophy: method names, parameter names, and return values should already communicate the runtime story. Keep business logic clean and expressive first, then use decorators exceptionally, not by default. Add decorators only when they provide concrete additional value, such as targeted narration, error-specific context, or sensitive-data redaction.

## Decorator Inventory

| Decorator | Module | Target | Purpose |
|---|---|---|---|
| `@traced()` | `@narrativetrace/proxy` | Method | Binds parameter names for trace output. |
| `@narrated()` | `@narrativetrace/proxy` | Method | Adds human-readable narration text to a traced method. |
| `@onError()` | `@narrativetrace/proxy` | Method | Adds contextual error text when a method throws. |
| `@notTraced()` | `@narrativetrace/proxy` | Method | Marks parameter values as redacted in trace output. |

All decorators use the [TC39 Stage 3 decorator proposal](https://github.com/tc39/proposal-decorators) (TypeScript 5.0+). They are method decorators that use `ClassMethodDecoratorContext`.

## `@traced`

Use `@traced` to bind explicit parameter names. This is essential when minifiers strip parameter names, or when you want more descriptive names in traces.

```ts
import { traced } from "@narrativetrace/proxy";

class OrderService {
  @traced("customerId", "productId", "quantity")
  placeOrder(cId: string, pId: string, qty: number) {
    // ...
  }
}
```

How it works:

- Parameter names are stored in a `WeakMap` keyed on the method function.
- When `traceObject()` intercepts a call, it looks up the names and uses them instead of `arg0`, `arg1`, etc.
- Names are positional — they map to arguments by index.

### Without `@traced` (manual parameter names)

If you can't or don't want to use decorators, pass parameter names to `traceObject()` directly:

```ts
const traced = traceObject(orderService, context, {
  placeOrder: ["customerId", "productId", "quantity"],
  cancelOrder: ["orderId"],
});
```

This is equivalent to `@traced` but works without any decorator support.

## `@narrated`

Use `@narrated` on methods when you want an explicit sentence in the trace instead of relying only on method name + parameters.

```ts
import { narrated } from "@narrativetrace/proxy";

class OrderService {
  @narrated("Placing order of {quantity} units for customer {customerId}")
  placeOrder(customerId: string, quantity: number) {
    // ...
  }
}
```

How it works:

- The narration template is stored in a `WeakMap` keyed on the method function.
- The template string is attached to the trace node's `MethodSignature.narration` field.
- Works with `traceObject()` — the narration appears in Markdown output as italic text beneath the call.

How placeholders resolve: `{paramName}` substitutes the named argument; `{param.property}` calls the getter on the raw argument object. Only a single property level resolves — `{order.card.number}` never resolves, and the placeholder survives literally. A redacted member reached by a property path resolves to `[REDACTED]`, never the raw value — see the redaction note under `@notTraced` below.

## `@onError`

Use `@onError` to attach context-specific messages for exceptions.

```ts
import { onError } from "@narrativetrace/proxy";

class PaymentService {
  @onError("Payment declined for customer {customerId}, amount was {amount}")
  charge(customerId: string, amount: number) {
    // ...
  }
}
```

How it works:

- The error context template is stored in a `WeakMap` keyed on the method function.
- When the method throws, the error context is attached to the trace node's `MethodSignature.errorContext` field.
- Enriches error traces with domain-specific context beyond just the exception message.

## `@notTraced`

Use `@notTraced` to redact sensitive parameter values.

```ts
import { notTraced } from "@narrativetrace/proxy";

class AuthService {
  @notTraced(1) // redact the parameter at index 1
  login(username: string, password: string) {
    // ...
  }
}
```

How it works:

- Parameter indices are stored in a `WeakMap<Function, Set<number>>`.
- The proxy renders redacted parameters as `[REDACTED]` in trace output.
- `ParameterCapture.redacted` is set to `true` for redacted parameters.
- Multiple indices can be redacted: `@notTraced(1, 2)`.
- For **object fields**, declare a static class field: `static notTraced = ["pan", "secret"]`
  — those properties render `[REDACTED]` during introspection, independent of the
  name-based `RedactionPolicy` deny-list (which already covers `password`, `token`, `ssn`,
  `cvv`, …).
- Typical use cases: passwords, tokens, secrets, card data.

**Redaction wins over a template that names it.** `@narrated` and `@onError` resolve
`{param.property}` paths against the raw arguments, and a path that reaches a redacted member
resolves to `[REDACTED]` — whether the member is deny-listed by name or explicitly listed in
`static notTraced`. Naming a path never weakens the rules that apply to the value directly:

```ts
class Card {
  static readonly notTraced = ["cvv"];
  constructor(readonly last4: string, readonly cvv: string) {}
}

class PaymentService {
  @narrated("Charging card ending {card.last4}, cvv {card.cvv}")
  @traced("card")
  charge(card: Card) { /* ... */ }
}
// narration: "Charging card ending 4111, cvv [REDACTED]"
```

If you need the value in a narrative, remove it from `static notTraced` (or from the deny-list
pattern it matches) — that removal is the deliberate, reviewable decision. A placeholder naming a
property that does not exist on the object is an authoring typo, not a redaction decision: it
survives literally, and the test-time unresolved-placeholder warning still fires for it.

## The purity contract — side effects during tracing

NarrativeTrace may invoke a small, fixed set of code paths on your objects while rendering
a trace. Keep those members **pure** — free of side effects such as lazy loading, access
counters, cache population, or I/O — exactly as you would for a debugger or a serializer.

What is invoked, and what is not:

- **Introspection enumerates own enumerable properties** (`Object.keys`). A getter defined
  on a class lives on the prototype, is never enumerated, and never runs during
  introspection. (An accessor defined directly on an object literal *is* own-enumerable
  and would run — prefer class getters or mark the field in `static notTraced`.)
- **What NarrativeTrace does invoke:** a custom `toString()` (own, non-default), a
  `@narrativeSummary`-designated method, and any property path you name in a
  `@narrated`/`@onError` template — `{order.total}` resolves via property access, so a
  getter named there *will* run.
- **Invocation is bounded and isolated.** Output is capped (`maxStringLength`,
  `maxArrayItems`, `maxObjectKeys`); a throwing getter or `toString()` never fails the
  traced business call (templates fall back to the literal `{placeholder}`, rendering
  falls back to a type-name marker); values render eagerly at the call site, so any side
  effect happens once, at a deterministic point. Thenables are never awaited — they render
  as `<pending>`.

If a member cannot be pure, list it in `static notTraced` — a redacted member's value is
never read at all — or give the type a curated `toString()`/`@narrativeSummary` so you
control exactly what is accessed. With an inactive context (level `off`, or parameter
capture disabled at `summary`), no argument rendering happens at all — no user code is
touched on the fast path.

## Combining Decorators

Decorators can be stacked on the same method:

```ts
import { traced, narrated, onError, notTraced } from "@narrativetrace/proxy";

class TransferService {
  @traced("fromAccountId", "toAccountId", "amount", "authToken")
  @narrated("Transferring {amount} from {fromAccountId} to {toAccountId}")
  @onError("Transfer rejected for source account {fromAccountId}")
  @notTraced(3) // redact authToken
  transfer(from: string, to: string, amount: number, token: string) {
    // ...
  }
}
```

This single method combines parameter naming, narration, targeted error context, and parameter redaction.

## Complete Example

```ts
import { NarrativeTraceConfig, SyncNarrativeContext, renderMarkdown } from "@narrativetrace/core";
import { traceObject, traced, narrated, onError, notTraced } from "@narrativetrace/proxy";

class PaymentService {
  @traced("customerId", "amount", "token")
  @narrated("Charging {amount} to customer {customerId}")
  @onError("Payment failed for customer {customerId}")
  @notTraced(2) // redact token
  charge(customerId: string, amount: number, token: string) {
    if (amount > 1000) throw new Error("Amount exceeds limit");
    return { transactionId: "TX-1", amount };
  }
}

const config = new NarrativeTraceConfig();
const context = new SyncNarrativeContext(config);
const traced = traceObject(new PaymentService(), context);

traced.charge("C1", 500, "tok_secret_123");
console.log(renderMarkdown(context.captureTrace()));
```

## See also

- [Installation Guide](installation-guide.md) — dependencies, integration paths, trace output setup
- [Configuration Guide](configuration-guide.md) — tracing levels, render options
- [Clarity Guide](clarity-guide.md) — scoring model, NLP components, static scanner
