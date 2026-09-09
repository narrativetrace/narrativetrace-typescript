# NarrativeTrace TypeScript Decorators Guide

This guide covers method-level trace metadata — parameter names, narration, error context, and redaction. The **default way to declare it is the config form** on `traceObject()`, at the composition root; the four decorators are the same declarations as nicer syntax for projects that already compile decorators (NestJS, Angular, any TypeScript 5+ app).

NarrativeTrace follows a **Code is the Log** philosophy: method names, parameter names, and return values should already communicate the runtime story. Keep business logic clean and expressive first, then add metadata exceptionally, not by default — only when it provides concrete additional value, such as targeted narration, error-specific context, or sensitive-data redaction.

## The config form — declare everything where you wrap

`traceObject()` accepts a per-method config that expresses everything the decorators express. It needs no decorator compilation, works on plain objects and plain JavaScript, and keeps trace metadata beside the wiring:

```ts
import { traceObject } from "@narrativetrace/proxy";

const payments = traceObject(paymentService, context, {
  methods: {
    charge: {
      params: ["customerId", "amount", "cardToken"],       // twin of @traced
      narration: "Charging {amount} to {customerId}",      // twin of @narrated
      onError: [                                           // twin of (stacked) @onError
        { template: "Charge failed for {customerId}" },
        { exception: CardDeclinedError, template: "Card declined for {customerId}" },
      ],
      notTraced: [2],                                      // twin of @notTraced — redact cardToken
    },
  },
});
```

Each axis maps one-to-one to a decorator:

| Config axis | Decorator twin | Meaning |
|---|---|---|
| `params: ["a", "b"]` | `@traced("a", "b")` | Positional parameter names |
| `narration: "…{a}…"` | `@narrated("…{a}…")` | Narration template on entry |
| `onError: "…"` or `[{ exception?, template }]` | `@onError("…")` / stacked `@onError(Type, "…")` | Error context at throw time; most specific type wins |
| `notTraced: [1, 2]` | `@notTraced(1, 2)` | Redact parameters by index |

Shorthands: a plain string `onError` is the catch-all (twin of `@onError("...")`), and the third argument still accepts the bare name map `traceObject(service, context, { placeOrder: ["customerId"] })` when names are all you need.

**Precedence:** a configured axis overrides the corresponding decorator metadata for that method, wholesale; an axis you leave out keeps the decorator's declaration. Config and decorators therefore compose — a library class can carry decorators and a composition root can still override one axis.

## Decorator Inventory

| Decorator | Module | Target | Purpose |
|---|---|---|---|
| `@traced()` | `@narrativetrace/proxy` | Method | Binds parameter names for trace output. |
| `@narrated()` | `@narrativetrace/proxy` | Method | Adds human-readable narration text to a traced method. |
| `@onError()` | `@narrativetrace/proxy` | Method | Adds contextual error text when a method throws. |
| `@notTraced()` | `@narrativetrace/proxy` | Method | Marks parameter values as redacted in trace output. |

All four decorators work in **both decorator dialects**: the standard [TC39 decorators](https://github.com/tc39/proposal-decorators) that TypeScript 5+ compiles by default, and the legacy `experimentalDecorators` dialect that NestJS and Angular projects compile. The dialect is detected at runtime from the call shape — nothing to configure, the same import serves both, and the published type declarations type-check under either compiler setting. If your environment does not compile decorators at all (plain JavaScript, or a build that leaves `@` untouched), a decorator call throws an error naming the fix instead of silently recording nothing — the fix being the equivalent config form on `traceObject()` (shown per decorator below).

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

This is equivalent to `@traced` but works without any decorator support. The same names can live in the full config form as `methods.placeOrder.params` (see the config section above); when both are given, `methods.<name>.params` wins over the bare map.

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

Config twin — the same narration without the decorator:

```ts
const traced = traceObject(orderService, context, {
  methods: {
    placeOrder: {
      params: ["customerId", "quantity"],
      narration: "Placing order of {quantity} units for customer {customerId}",
    },
  },
});
```

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
- Stack several — `@onError(NotFoundError, "…")` above `@onError("…")` — and the declaration matching the thrown type most specifically wins at throw time.

Config twin — a string is the catch-all, the array form carries typed declarations:

```ts
const traced = traceObject(paymentService, context, {
  methods: {
    charge: {
      params: ["customerId", "amount"],
      onError: [
        { template: "Payment declined for customer {customerId}, amount was {amount}" },
        { exception: InsufficientFundsError, template: "Insufficient funds for {customerId}" },
      ],
    },
  },
});
```

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
  `cvv`, … — and is multilingual by default: `contraseña`, `senha`, `motDePasse`, `密码`, …).
- Typical use cases: passwords, tokens, secrets, card data.
- Config twin: `methods.login.notTraced = [1]` on `traceObject()` — same indices, no decorator needed.

**Redaction wins over a template that names it.** `@narrated` and `@onError` resolve
`{param.property}` paths against the raw arguments, and a path that reaches a redacted member
resolves to `[REDACTED]` — whether the member is deny-listed by name or explicitly listed in
`static notTraced`. A bare `{name}` naming a value directly obeys the same two rules: the
deny-list reads that key exactly as it reads a field name, and the value's own shape is checked
too, so `@narrated("login {password}")` and a JWT arriving as `{value}` both render `[REDACTED]`.
Naming a path, or a value, never weakens the rules that apply to the value directly:

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

## The target-binding trade — self-calls do not nest

Traced methods run with `this` bound to the raw target, not the proxy (`Reflect.apply(fn, target, args)` inside the method wrapper). A method calling a sibling on the same object (`this.validate(order)`) therefore invokes the raw method — the call runs correctly, but it is not captured, so self-calls never appear as nested spans. This is a deliberate design trade, not a gap: binding the raw target makes the proxy immune to the classic Proxy landmines — `#private` fields (which throw through a proxy receiver), built-ins with internal slots (`Map`, `Date`), and arrow-function fields.

Nesting comes from wrapping collaborators, and that is the one structural rule: **decompose into collaborator services, wrap each where it is constructed.**

```ts
// One class, self-calls: only placeOrder is captured.
class OrderService {
  placeOrder(customerId: string) {
    this.reserveStock(customerId);   // runs, not captured
    this.charge(customerId);         // runs, not captured
  }
  // ...
}

// Collaborators wrapped at the composition root: the full nested narrative.
const inventory = traceObject(new InventoryService(), context);
const payments = traceObject(new PaymentService(), context);
const orders = traceObject(new OrderService(inventory, payments), context);
```

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
