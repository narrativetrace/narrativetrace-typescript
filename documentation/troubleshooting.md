# Troubleshooting

Symptom → cause → fix, for the failure modes people actually hit. Some
entries are the full explanation; others point at the guide that already
carries it in more detail rather than repeating it here — one home per fact.

## Parameters show as `arg0`, `arg1`

**Cause:** JavaScript does not retain parameter names at runtime — there is
no compiler flag that recovers them, unlike a JVM `-parameters` flag.
Without help, `traceObject()` falls back to positional names.

**Fix:** supply names either way —

```ts
class OrderService {
  @traced("customerId", "productId", "quantity")
  placeOrder(customerId: string, productId: string, quantity: number) { /* ... */ }
}
```

or, without decorators:

```ts
traceObject(orderService, context, { placeOrder: ["customerId", "productId", "quantity"] });
```

A minified production bundle strips names the same way, so this is not a
dev-only concern — see [Decorators Guide § `@traced`](decorators-guide.md#traced).

## No trace files are written

**Cause:** almost always, the test used the file-free fixture
(`narrativeTest`) instead of the file-writing one (`createNarrativeTest`) —
this runtime has two Vitest fixtures on purpose, one for assertions only and
one for artifacts. Less commonly: the trace tree had zero roots (nothing was
called through the traced object), and `writeTraceOutput` writes nothing at
all for an empty trace by design, so a suite that captured no spans leaves
no directories behind.

**Fix:** use `createNarrativeTest` (see
[First 10 Minutes](first-10-minutes.md#3-add-one-vitest-test)), and check
that the call under test actually went through the traced wrapper — a call
made on the un-wrapped instance instead of the object `traceObject()`
returned records nothing.

## A getter or field never shows up in the trace

**Cause:** `traceObject()` wraps methods, not arbitrary properties. Getters
and non-function properties pass through the `Proxy` unwrapped — reading
`traced.total` calls the real getter directly and nothing is captured. This
is deliberate: NarrativeTrace narrates *calls*, and a getter read looks
identical to a plain property read from the caller's side.

**Fix:** if the value matters to the trace, either return it from a traced
method, or name the property in a `@narrated`/`@onError` template
(`{order.total}`) — property-path resolution *does* invoke the getter, once,
at render time. See the purity contract in the
[Decorators Guide](decorators-guide.md#the-purity-contract--side-effects-during-tracing).

## `@traced`/`@notTraced` decorators fail to apply or fail to compile

**Cause:** the decorators accept both dialects — standard TC39 decorators
(the TypeScript 5 default) and legacy `experimentalDecorators` (NestJS,
Angular) — detected at runtime from the call shape. A failure therefore
means the environment is not compiling decorators at all: TypeScript below
5.0 without `experimentalDecorators`, a transform that leaves `@` syntax
untouched, or plain JavaScript. In that case the decorator throws a
`TypeError` naming this fix rather than silently recording nothing.

**Fix:** either enable decorator compilation (TypeScript 5.0+ compiles the
standard dialect with no flag; `experimentalDecorators: true` also works),
or skip decorators entirely and use the config form on `traceObject()` —
it expresses everything the decorators express. See the
[Decorators Guide](decorators-guide.md).

## Clarity score seems wrong

**Cause:** usually a generic name the NLP analysis flags — `get`, `set`,
`process`, `handle`, `data`, `info`, `temp`, and similar score low
regardless of context.

**Fix:** review the `issues` array in the scenario's `.clarity-json` (or the
suite's `clarity-report.md` once `ClaritySuiteReporter` is wired in) and
replace the flagged name with a domain-specific one (`getData()` →
`fetchOrderHistory()`). See the [Clarity Guide](clarity-guide.md) for the
full scoring model — renaming `placeOrder` to `process` in
[First 10 Minutes § 6](first-10-minutes.md#6-rename-placeorder-to-process-and-watch-clarity-drop)
reproduces this exact drop.

## Async trace is missing, or a background task never appears

**Cause:** `AsyncNarrativeContext` follows the active span across an
`await`, but a task that is launched and never awaited (`setTimeout`, a
detached promise, a queued job) does not inherit it — there is nothing to
follow, because the launching call already returned.

**Fix:** wrap detached work with `ForkJoinGroup`/`FireAndForgetGroup`, or
graft it by hand with `context.snapshot()` + `snapshot.wrap(fn)`. See
[Choosing an Integration § Caveats per path](choosing-an-integration.md#caveats-per-path).

## `captureTrace()` returns an empty or partial tree from another async task

**Cause:** capture is scoped to the context instance, not to a thread the
way a JVM runtime's is — but a `SyncNarrativeContext` (browser) has no implicit
propagation at all, so two un-awaited overlapping calls on the same context
corrupt each other's spans rather than merely missing one.

**Fix:** on Node, use `AsyncNarrativeContext`. In a browser, or for
overlapping work anywhere, use an explicit fork/fire-and-forget group per
concurrent task instead of sharing one context across un-awaited calls.

## A capture printed "NarrativeTrace dropped N events"

**Cause:** not a failure — the event ring (`BufferedEventConsumer`) is a
fixed-size buffer, `8,192` events by default in `createNarrativeTest`, and a
test that traces more calls than that holds sheds the oldest events rather
than growing without bound or blocking the caller. The exact message:

```text
⚠️ NarrativeTrace dropped 16 events: the capture buffer (4) overflowed, so this narrative is incomplete. Raise it with createNarrativeTest({ bufferCapacity: 32 }).
```

**Fix:** raise `bufferCapacity` to the value the message names, or narrow
what the test traces. See
[Configuration Guide § 8](configuration-guide.md#8-event-pipeline-buffering-bufferedeventconsumer)
for the capacity-vs-latency table and how to size it for a longer-lived
context.

## `@notTraced` redacts the parameter but a nested field still shows

**Cause:** parameter-index redaction (`@notTraced(i)`) and field-level
redaction (`static notTraced = [...]`) are two different declarations. Index
redaction blanks the whole argument; a field inside an *unredacted* argument
is rendered field-by-field unless that field itself is deny-listed by name
or declared.

**Fix:** add the field to the class's own `static notTraced` list:

```ts
class Card {
  static readonly notTraced = ["cvv"];
  constructor(readonly last4: string, readonly cvv: string) {}
}
```

Full contract, including what a narration template does with a redacted
path: [Privacy and Redaction](privacy-and-redaction.md).

## How NarrativeTrace behaves next to another proxy or interceptor

Not a bug report — a design question that comes up whenever a service is
already wrapped by something else (a DI container, another `Proxy`, a
contract library). NarrativeTrace narrates business-boundary crossings only,
and which wrapper sits "outer" never changes the business result or
exception that reaches the narrative — see the
[README FAQ](../README.md#how-does-narrativetrace-interact-with-other-libraries-that-wrap-methods-aop-proxies-contract-libraries)
for the full coexistence contract.
