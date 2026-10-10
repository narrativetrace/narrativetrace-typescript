# NarrativeTrace TypeScript — Complete Reference

> Code is the log. Method names, parameter names, and return values already describe what code does. NarrativeTrace generates human-readable execution traces automatically — no log statements needed.

## Overview

NarrativeTrace is a TypeScript library that auto-generates execution traces from method/parameter names and return values. It wraps objects with ES Proxy to capture every method call, then renders the captured trace as Markdown, prose, Mermaid diagrams, PlantUML, or JSON.

The core insight: if your method is called `placeOrder(customerId, quantity)` and returns an `OrderResult`, you don't need `console.log("Placing order...")`. The method signature already says it. NarrativeTrace captures that information and renders it as a readable execution trace.

**Key features:**
- Zero-config trace capture via ES Proxy
- Multiple output formats: Markdown, prose, indented text, Mermaid, PlantUML, JSON
- Vitest plugin with automatic per-test output
- Naming clarity analysis that scores code readability (method, class, parameter names)
- Express and Hono middleware integration
- Browser support (console rendering, network export)
- AsyncLocalStorage-based context for per-request isolation
- Decorators (both dialects — standard TC39 and legacy `experimentalDecorators`): `@traced`, `@narrated`, `@onError`, `@notTraced`

**Requirements:** Node.js 20+ (CI runs 22), TypeScript 5.0+ (for decorators)

**Package scope:** `@narrativetrace`

---

## Quick Start

### 1. Install

```bash
pnpm add @narrativetrace/core-node @narrativetrace/proxy
```

`core-node` re-exports everything in `@narrativetrace/core` and registers Node's id generator;
`@narrativetrace/core` alone falls back to Web Crypto and still works, but `core-node`/`core-web` is
the tested, documented path — use the platform package, not bare `core`.

### 2. Trace an object

```ts
import { NarrativeTraceConfig, SyncNarrativeContext, renderIndentedText } from "@narrativetrace/core-node";
import { traceObject } from "@narrativetrace/proxy";

const context = new SyncNarrativeContext(new NarrativeTraceConfig());
const traced = traceObject(orderService, context);

traced.placeOrder("C1", "P1", 2);
console.log(renderIndentedText(context.captureTrace()));
```

### 3. With Vitest

```bash
pnpm add -D @narrativetrace/vitest @narrativetrace/proxy vitest
```

`vitest` is the only peer dependency; `@narrativetrace/vitest`'s other four NarrativeTrace
dependencies (core-node, clarity, diagrams, glossary) install automatically with it — they release
in lockstep and are never independently versioned. `@narrativetrace/proxy` is listed explicitly
because the example below imports `traceObject` from it directly: pnpm only exposes a package's
own direct dependencies, not a dependency's dependencies, so anything you `import` yourself still
needs to be your own dependency.

```ts
import { createNarrativeTest } from "@narrativetrace/vitest";
import { traceObject } from "@narrativetrace/proxy";

const test = createNarrativeTest({ formats: ["md", "json"] });

test("customer places order", ({ narrativeContext }) => {
  const traced = traceObject(orderService, narrativeContext);
  traced.placeOrder("C1", "P1", 2);
});
```

Output appears in `narrativetrace-output/`.

---

## Package Map

NarrativeTrace ships 18 published packages. Most projects need only 2-3 (`core` + `proxy`, plus one
integration). Every package depends only on `core` (and occasionally a sibling); there is no
`@narrativetrace/examples` package — the example apps live in the repo's `examples/` directory.

### Core & proxy

| Package | Purpose |
|---------|---------|
| `@narrativetrace/core` | Context, event model, renderers, config, export. Zero runtime dependencies; platform-agnostic. |
| `@narrativetrace/core-node` | Node runtime: `AsyncNarrativeContext` (AsyncLocalStorage), `NARRATIVETRACE_*` env config, shutdown auto-flush. |
| `@narrativetrace/core-web` | Browser runtime seam for the platform-agnostic core. |
| `@narrativetrace/proxy` | ES Proxy-based method interception (most common entry point). Depends on core. |

### Test framework, diagrams, clarity

| Package | Purpose |
|---------|---------|
| `@narrativetrace/vitest` | Vitest fixture: auto context, output files, per-test + suite-wide clarity reports. |
| `@narrativetrace/diagrams` | Mermaid and PlantUML sequence diagram renderers. |
| `@narrativetrace/clarity` | Naming clarity analysis, scoring, suite report, and the `narrativetrace-clarity` gate CLI. |

### HTTP & framework adapters

| Package | Purpose |
|---------|---------|
| `@narrativetrace/express` | Express middleware: per-request context, fail-safe extractors, `onRequestComplete`. |
| `@narrativetrace/hono` | Hono middleware (edge/serverless), `finally`-completion parity. |
| `@narrativetrace/nestjs` | NestJS `AutoProxyModule.forRoot({ pipeline, consumers, onRequestComplete })`. |
| `@narrativetrace/angular` | Angular integration: `provideNarrativeTrace()`, interceptor, DI tracing. |
| `@narrativetrace/react` | React hooks/provider for capturing component + service traces. |
| `@narrativetrace/react-router` | React Router navigation capture. |
| `@narrativetrace/browser` | Browser console rendering and network export. |

### Observability & logging

| Package | Purpose |
|---------|---------|
| `@narrativetrace/observability` | Log-scope enricher (`code.*`, `trace_id`, `service.*`, `nt.depth`) + request middleware. |
| `@narrativetrace/opentelemetry` | OTel bridge: live `createOtelEventConsumer` + batch `TraceSpanExporter`. |
| `@narrativetrace/winston` | Winston consumer with typed fields + configurable per-event levels. |
| `@narrativetrace/pino` | Pino consumer with typed fields + configurable per-event levels. |

### Dependency graph

```
@narrativetrace/core (zero deps)
├── @narrativetrace/core-node   → core
├── @narrativetrace/core-web    → core
├── @narrativetrace/proxy       → core
├── @narrativetrace/diagrams    → core
├── @narrativetrace/clarity     → core
├── @narrativetrace/browser     → core, core-web
├── @narrativetrace/vitest      → core, core-node, diagrams, clarity, glossary
├── @narrativetrace/express     → core, core-node, proxy
├── @narrativetrace/hono        → core, core-node, proxy
├── @narrativetrace/nestjs      → core, core-node, proxy
├── @narrativetrace/angular     → core, proxy
├── @narrativetrace/react       → core, proxy
├── @narrativetrace/react-router→ core, proxy
├── @narrativetrace/observability → core
├── @narrativetrace/opentelemetry → core
├── @narrativetrace/winston     → core
└── @narrativetrace/pino        → core
```

---

## Concurrency

Parallel work stays readable. `ForkJoinGroup` propagates the parent's trace identity (traceId,
request/user context) into each forked task and records per-member timing; `FireAndForgetGroup`
launches background work that still appears in the trace.

```ts
import { ForkJoinGroup, FireAndForgetGroup } from '@narrativetrace/core';

// Fork/join — run priced + stock checks in parallel under one shared group.
const [price, stock] = await ForkJoinGroup.all(context, [
  (ctx) => traceObject(pricingService, ctx).quote('P1'),
  (ctx) => traceObject(inventoryService, ctx).check('P1'),
]);

// Fire-and-forget — a notification that must not block the response.
const bg = FireAndForgetGroup.create(context);
bg.launch((ctx) => traceObject(notificationService, ctx).sendReceipt('C1'));
```

The Markdown renderer surfaces the concurrency structure and where time actually went, including
join wait-analysis:

```
- ⑂ fork [2 tasks]
  - ↦ `InventoryService.check("P1")` → `true` — 40ms
  - ↦ `PricingService.quote("P1")` → `"12.50"` — 110ms
- ⑃ join — 110ms (waited 70ms for PricingService after InventoryService)
```

Both groups **publish their own members** — at join, and as each detached task settles — under the
span that launched them. They deliberately do not join the live-adoption path (see
`activateWithoutAdoption` below), so a fire-and-forget child appears when its launcher publishes it
and never merely because a capture caught it mid-flight.

Work propagated by a snapshot instead of a group is reported the other way round: it joins the
launching trace as soon as it publishes a call. See **ContextSnapshot** below.

Un-awaited overlapping calls on a shared browser `SyncNarrativeContext` are unsafe — use an explicit
fork/fire-and-forget per task.

---

## Core API Reference

### NarrativeContext (interface)

The central interface for recording trace events. All tracing flows through this. The snippet
below calls it directly — the same two hooks `traceObject()` wraps around every traced method for
you:

<!-- snippet: examples/core-api-reference/src/index.ts -->
```ts
import { parameterCapture, renderMarkdownBody, renderValue } from "@narrativetrace/core";
import { NarrativeTraceConfig, SyncNarrativeContext } from "@narrativetrace/core-node";

// Backs the "Core API Reference" section of documentation/llms-full.md (<!-- snippet: -->
// embedded, checked by `pnpm run snippet-check` — never hand-copied there). This is the raw
// NarrativeContext surface `traceObject()` calls on your behalf: `enterMethod` returns the
// SpanId of the frame it just pushed, and both exit calls take that handle back so the context
// can pop the right frame even when calls interleave (concurrent/async work, a frame entered by
// one call and exited by another). A framework integration that cannot wrap its target in a
// Proxy — a decorator, a custom object model — calls this directly instead.
const context = new SyncNarrativeContext(new NarrativeTraceConfig());

function placeOrder(customerId: string, quantity: number): string {
  const handle = context.enterMethod("OrderService", "placeOrder", [
    parameterCapture("customerId", renderValue(customerId), false),
    parameterCapture("quantity", renderValue(quantity), false),
  ]);
  try {
    const orderId = `ORD-${customerId}-${quantity}`;
    context.exitMethodWithReturn(renderValue(orderId), handle);
    return orderId;
  } catch (error) {
    context.exitMethodWithException(error, handle);
    throw error;
  }
}

placeOrder("C1", 2);
console.log(renderMarkdownBody(context.captureTrace()));
```
<!-- /snippet -->

**Key methods:**
- `enterMethod(className, methodName, params, options)` — push a frame and return its `SpanId`. Must have a matching exit call.
- `exitMethodWithReturn(rendered, handle)` — pop the frame named by `handle`, record success. The value is pre-rendered to string.
- `exitMethodWithException(error, handle)` — pop the frame named by `handle`, record failure.
- `captureTrace()` — return the immutable trace tree.
- `reset()` — clear all state. Call between tests/requests.

**Implementations:**
- `SyncNarrativeContext` — default, zero-dependency, stack-based
- `AsyncNarrativeContext` — wraps `AsyncLocalStorage<SyncNarrativeContext>` for per-request isolation
- `NOOP_CONTEXT` — discards everything (for disabled tracing)

The five members above are the small public subset every integration calls — span handles, live-child
registration, snapshots, request/user context, and trace-loss accounting are all real, public
`SyncNarrativeContext` members this subset omits. See
[SyncNarrativeContext — full member reference](#syncnarrativecontext--full-member-reference) below
for the complete surface.

### SyncNarrativeContext

Default implementation using an internal call stack.

```ts
import { NarrativeTraceConfig, SyncNarrativeContext } from "@narrativetrace/core";

// Default (detail level)
const context = new SyncNarrativeContext(new NarrativeTraceConfig());

// With explicit level
const config = new NarrativeTraceConfig("narrative");
const context = new SyncNarrativeContext(config);

// Change level at runtime
config.level = "errors";
```

### SyncNarrativeContext — full member reference

Every public member `SyncNarrativeContext` declares, generated from `packages/core/src/context.ts`
by `tools/context-reference-table.ts` and checked every commit (`pnpm run context-reference-check`,
wired into `pnpm run check`) so this table cannot drift the way the hand-typed `NarrativeContext`
interface block above already had — run `pnpm run context-reference-render` to regenerate it after
changing the class.

<!-- context-reference:begin -->
| Member | Description |
|---|---|
| `readonly config: NarrativeTraceConfig` | — |
| `readonly eventPipeline: EventPipeline` | — |
| `get isActive(): boolean` | — |
| `get capturesParameterValues(): boolean` | — |
| `get activeSpanId(): SpanId | null` | — |
| `get storyId(): string | null` | — |
| `get chapterId(): string | null` | — |
| `get currentTraceId(): TraceId | null` | — |
| `traceId(): TraceId` | — |
| `setRequestContext(httpMethod: string, httpRoute: HttpRoute, clientIp: ClientIp): void` | — |
| `setUserContext(enduserId?: EnduserId, sessionId?: SessionId, tenantId?: TenantId): void` | — |
| `knownSpanIds(): ReadonlySet<SpanId>` | — |
| `reportableSpanIds(): Set<SpanId>` | Everything this context can answer for right now: the spans it opened itself, the ones already |
| `liveChildSpanIds(): Set<SpanId>` | What every live child can answer for, transitively, pruning registrations whose child has been |
| `adopt(spanIds: ReadonlySet<SpanId>): void` | Takes over the spans an asynchronous child published under a snapshot of this context. |
| `discardUnreportable(): void` | Discards this context's own reportable spans because the request that could have reported |
| `adoptedSpans(): ReadonlySet<SpanId>` | The spans already handed over by finished asynchronous children. |
| `registerLiveChild(child: SyncNarrativeContext): LiveChildRegistration | null` | Publishes a child context to this one for the lifetime of its scope, so the child's spans are |
| `unregisterLiveChild(registration: LiveChildRegistration | null): void` | Ends a live registration. A `null` handle is a registration the ceiling refused. |
| `refusedScopeCount(): number` | Asynchronous scopes whose hand-over the adoption ceiling refused whole. |
| `refusedSpanCount(): number` | Spans lost to those refusals — the number a reader of the trace is missing. |
| `traceLoss(): TraceLoss` | What this context's captured trace is missing, and why: events the buffer shed, the |
| `enterMethod(className: string, methodName: string, params: readonly ParameterCapture[], options?: { narration?: string; errorContext?: string }): SpanId` | — |
| `exitMethodWithReturn(renderedValue: string | null, handle?: SpanId, structured?: RenderedValue): void` | — |
| `exitMethodWithException(error: unknown, handle?: SpanId, errorContext: string | null = null): void` | — |
| `detachFrame(handle: SpanId): void` | — |
| `parentOf(handle: SpanId): SpanId | null` | — |
| `run<T>(fn: () => T, _inheritedTraceId?: TraceId): T` | — |
| `runScoped<T>(_handle: SpanId, fn: () => T): T` | — |
| `captureTrace(): TraceTree` | — |
| `reset(): void` | — |
| `inheritRequestExtras(source: SyncNarrativeContext): void` | — |
| `exportRequestExtras(): SpanContextExtras` | A copy of the request/user metadata for propagation to forked/background children. |
| `applyRequestExtras(extras: SpanContextExtras): void` | — |
| `setSnapshotParent(parentSpanId: SpanId, traceId: TraceId): void` | — |
| `applySnapshot(traceId: TraceId | null, parentSpanId: SpanId | null, crossesBoundary = true): void` | Adopts a snapshot's captured lineage onto this context for the duration of a scope. |
| `get isFromSnapshot(): boolean` | True while this context is running work activated from another context's snapshot. |
| `get generation(): number` | How many times this context has been `reset`. |
| `beginScope(): ContextScope` | Opens a scope on this context, returning the handle that rolls its stack, trace identity and |
| `snapshot(): ContextSnapshot` | — |
<!-- context-reference:end -->

### AsyncNarrativeContext

Wraps `AsyncLocalStorage` for per-request trace isolation in server environments.

```ts
import { AsyncNarrativeContext, NarrativeTraceConfig } from "@narrativetrace/core";

const asyncContext = new AsyncNarrativeContext(new NarrativeTraceConfig());

asyncContext.run(() => {
  // Isolated trace context for this execution
  tracedService.placeOrder("C1", "P1", 2);

  // A nested run() is an asynchronous hop: it joins this scope's trace, is reported here from the
  // moment it publishes a call — not only once it settles — and its first span is tagged `async`.
  const background = asyncContext.run(async () => tracedNotifier.notifyOrderPlaced("ORD-1"));

  const tree = asyncContext.captureTrace(); // already contains notifyOrderPlaced
  return background;
});
```

A **top-level** `run()` has crossed no boundary — it *is* the request, the analogue of a thread
getting its own stack — so it registers with nothing and is not tagged.

### TracingLevel (type)

Controls trace capture verbosity:

| Level | Captures | Parameter Values |
|-------|----------|-----------------|
| `"off"` | Nothing | N/A |
| `"errors"` | Exception paths only | No |
| `"summary"` | Root + leaf calls only | No |
| `"narrative"` | All calls | No |
| `"detail"` | All calls | Yes |

Default: `"detail"`.

Helper functions:
- `isActiveLevel(level)` — returns `false` for `"off"`, `true` otherwise
- `isEnabled(current, required)` — returns `true` if `current >= required` in level ordering

### TraceTree, TraceNode, and data model

```ts
// TraceTree — immutable result of trace capture
interface TraceTree {
  readonly roots: readonly TraceNode[];
  readonly isEmpty: boolean;
}

// TraceNode — single method invocation
interface TraceNode {
  readonly signature: MethodSignature;
  readonly outcome: TraceOutcome;
  readonly children: readonly TraceNode[];
  readonly durationMs: number;
}

// MethodSignature — identifies the method
interface MethodSignature {
  readonly className: string;
  readonly methodName: string;
  readonly parameters: readonly ParameterCapture[];
  readonly narration?: string;
  readonly errorContext?: string;
}

// ParameterCapture — captured parameter
interface ParameterCapture {
  readonly name: string;
  readonly renderedValue: string;
  readonly redacted: boolean;
}

// TraceOutcome — how the method completed
type TraceOutcome = Returned | Threw;

interface Returned {
  readonly kind: "returned";
  readonly renderedValue: string | null;
}

interface Threw {
  readonly kind: "threw";
  readonly error: unknown;
}
```

**Important:** Values are eagerly serialized at capture time. `renderedValue` fields hold pre-rendered strings. String values include quotes (`"\"order-42\""`), numbers/booleans are plain (`"42"`, `"true"`). Empty string `""` means suppressed (non-detail level).

### ContextSnapshot (cross-boundary propagation)

Propagation is **bidirectional**: the snapshot carries the trace id, the launching span and the
request metadata *into* the asynchronous work, and the work traced there comes *back* — the context
that took the snapshot reports it. The rule is **published, therefore reportable**: a context reports
its own spans, the ones an asynchronous child handed over when its scope closed, and everything a
still-running child can answer for, transitively.

```ts
const snapshot = context.snapshot();

// Wrap a function to run in the parent context
snapshot.wrapFn(otherContext, () => {
  tracedService.processOrder("order-1");
});

// Or manual activation
const scope = snapshot.activate(otherContext);
try {
  tracedService.processOrder("order-1");
} finally {
  scope.close(); // hands the work back to `context`
}

// Opt out when you publish the children yourself (what ForkJoinGroup and
// FireAndForgetGroup do): registers nothing, hands nothing over, at every hop.
const detached = snapshot.activateWithoutAdoption(otherContext);
```

**Placement follows submit time.** Snapshot taken while the launching call is still open → the work
is a child of that call. Taken after it returned → the work is the next root of the same trace.

**Bounds.** The origin is held weakly (and by reset generation), so a pending snapshot cannot keep a
finished request alive. Adoption is capped at 10,000 spans per context and a batch that would cross
the cap is refused **whole** — an incomplete trace is honest, a wrong-shaped one is not. Refusals are
counted in `context.traceLoss()` beside the capture buffer's own drops.

**Tagging.** The first span opened under an activated snapshot carries
`concurrency.kind === "async"`, keyed by the launching span; everything deeper is ordinary
sequential work in that scope.

### Renderers

```ts
import {
  renderIndentedText,
  renderMarkdown,
  renderProse,
  exportJson,
  frameScenario,
} from "@narrativetrace/core";
```

**Built-in renderers:**
- `renderIndentedText(tree)` — plain text with arrow notation
- `renderMarkdown(tree, options?)` — Markdown with YAML frontmatter
- `renderProse(tree)` — natural-language sentences
- `exportJson(tree, metadata)` — JSON with enter/exit events
- `frameScenario(testName)` — converts test names to scenario titles

### ValueRenderer

Serializes objects to strings. Handles:
- Primitives (string, number, boolean, bigint, symbol)
- `null` and `undefined`
- Arrays and plain objects
- Functions (`"<function>"`)
- Cycle detection (identity-based, renders `"<circular>"`)
- Truncation (`maxStringLength`, `maxArrayItems`, `maxObjectKeys`)

```ts
import { renderValue } from "@narrativetrace/core";

renderValue("hello");           // "\"hello\""
renderValue(42);                 // "42"
renderValue({ a: 1, b: 2 });    // "{\"a\": 1, \"b\": 2}"
renderValue([1, 2, 3, 4, 5, 6]); // "[1, 2, 3, 4, 5, ... (6 total)]"
```

---

## Proxy API Reference

### traceObject

Creates an ES Proxy that intercepts method calls and records trace events.

```ts
import { traceObject, type ProxyOptions } from "@narrativetrace/proxy";

// Basic usage
const traced = traceObject(target, context);

// With explicit parameter names
const traced = traceObject(target, context, {
  placeOrder: ["customerId", "productId", "quantity"],
});

// Full config form — the config twin of every decorator, per method
const traced = traceObject(target, context, {
  className: "OrderService",      // override constructor.name
  includeReturnValues: true,      // default: true
  methods: {
    charge: {
      params: ["customerId", "amount", "cardToken"],   // twin of @traced
      narration: "Charging {amount} to {customerId}",  // twin of @narrated
      onError: [                                       // twin of (stacked) @onError
        { template: "Charge failed for {customerId}" },
        { exception: RangeError, template: "Bad amount for {customerId}" },
      ],
      notTraced: [2],                                  // twin of @notTraced
    },
  },
});
```

A configured axis overrides the same method's decorator metadata; an absent axis keeps the decorator's declaration. A plain string `onError` is the catch-all shorthand — see the "Full config form" example above.

**Requirements:**
- Target must be an object with methods
- Works with classes, plain objects, and any object with function properties
- Getter properties are passed through without tracing

**Target-binding trade (by design):** traced methods run with `this` bound to the raw target, not the proxy, so a method calling a sibling on the same object runs correctly but is not captured — self-calls never nest. In exchange the proxy is immune to `#private` fields, internal-slot built-ins (`Map`, `Date`), and arrow-function fields. Nesting comes from wrapping collaborators, and that is the one structural rule: decompose into collaborator services, wrap each where it is constructed.

### Decorators

All decorators work in both decorator dialects — standard TC39 (the TypeScript 5 default) and legacy `experimentalDecorators` (NestJS, Angular) — detected at runtime from the call shape; the same import serves both. An environment that does not compile decorators at all gets a `TypeError` naming the fix (use the config form on `traceObject()`).

#### @traced(...names)

Binds parameter names to a method:

```ts
import { traced } from "@narrativetrace/proxy";

class OrderService {
  @traced("customerId", "productId", "quantity")
  placeOrder(c: string, p: string, q: number) { /* ... */ }
}
```

#### @narrated(template)

Adds a human-readable narration template:

```ts
import { narrated } from "@narrativetrace/proxy";

class OrderService {
  @narrated("Placing order for customer {customerId}")
  placeOrder(customerId: string, quantity: number) { /* ... */ }
}
```

#### @onError(template)

Adds error context when the method throws:

```ts
import { onError } from "@narrativetrace/proxy";

class PaymentService {
  @onError("Payment declined for customer {customerId}")
  charge(customerId: string, amount: number) { /* ... */ }
}
```

#### @notTraced(...indices)

Redacts parameter values at the given indices:

```ts
import { notTraced } from "@narrativetrace/proxy";

class AuthService {
  @notTraced(1)  // redact password
  login(username: string, password: string) { /* ... */ }
}
```

---

## Vitest API Reference

### narrativeTest

A Vitest `test.extend` fixture that provides a `NarrativeContext` per test:

```ts
import { narrativeTest } from "@narrativetrace/vitest";

narrativeTest("my test", ({ narrativeContext }) => {
  const traced = traceObject(service, narrativeContext);
  traced.doWork();
  // Assert on narrativeContext.captureTrace() if needed
});
```

### createNarrativeTest(options?)

Creates a configured test fixture with automatic file output:

```ts
import { createNarrativeTest } from "@narrativetrace/vitest";

const test = createNarrativeTest({
  outputDir: "narrativetrace-output",  // default
  formats: ["md", "json", "mmd"],      // default: ["md"]
  bufferCapacity: 8192,                // default: 8192 events, sized for a test not a server
});
```

`bufferCapacity` is the per-test capture ring, passed explicitly by this package
(the runtime never detects a test framework). Overflow is announced, not silent:
one console line plus a footer on the Markdown and diagram artifacts.

### writeTraceOutput(tree, target)

Low-level function for manual trace file writing:

```ts
import { writeTraceOutput, type TraceFormat } from "@narrativetrace/vitest";

writeTraceOutput(tree, {
  outputDir: "output",
  moduleName: "order-service", // groups artifacts by test module
  testName: "customer places order",
  formats: ["md", "json"],
});
```

Layout: `<outputDir>/<moduleName>/<test>.md` (and `.json`), with diagrams
under `<outputDir>/diagrams/<moduleName>/<test>.mmd`. Both `moduleName`
and `testName` are sanitized, so neither can escape `outputDir`.

---

## Diagrams API Reference

### renderMermaidSequence(tree)

Renders a Mermaid sequence diagram from a trace tree:

```ts
import { renderMermaidSequence } from "@narrativetrace/diagrams";

const mermaid = renderMermaidSequence(tree);
// sequenceDiagram
//   participant OrderService
//   participant CustomerService
//   OrderService->>CustomerService: findCustomer("C1")
//   CustomerService-->>OrderService: {"id": "C1", ...}
```

### renderPlantUmlSequence(tree)

Renders a PlantUML sequence diagram with activation/deactivation:

```ts
import { renderPlantUmlSequence } from "@narrativetrace/diagrams";

const puml = renderPlantUmlSequence(tree);
// @startuml
// participant OrderService
// participant CustomerService
// OrderService -> CustomerService: findCustomer("C1")
// activate CustomerService
// CustomerService --> OrderService: {"id": "C1", ...}
// deactivate CustomerService
// @enduml
```

---

## Clarity API Reference

For guided setup, use the [add-narrativetrace-clarity skill](agent-skills.md): it registers
`ClaritySuiteReporter`, runs the suite, checks that `clarity-results.json` is fresh and nonempty,
explains the scores, renames by the report's suggestions, and adds the `narrativetrace-clarity`
gate only when requested. `add-narrative-tracing` owns first-trace installation;
`narrativetrace-doctor` diagnoses missing tracing or output.

### analyzeClarity(tree, vocabulary?)

Analyzes a trace tree and returns clarity scores:

```ts
import { analyzeClarity, type ClarityResult } from "@narrativetrace/clarity";

const result: ClarityResult = analyzeClarity(tree);
// result.overall — 0.0 to 1.0
// result.issues — ClarityIssue[]
```

The optional second argument is the project's own vocabulary, read from the
committed `glossary.json` (ADR-012) — there is no second dictionary file. A
`verb-phrase` term contributes its leading verb as a **domain verb** and the rest
as **domain nouns** (`settle trade` → verb `settle`, noun `trade`); `word` and
`noun-phrase` terms contribute every token as a **domain noun**. **Accepted
shorthand comes from the glossary's root-level `abbreviations` section alone**
(`{"fx": "foreign exchange"}`, schema 2), so the abbreviation dictionary stops
flagging a listed token — being a token of some committed term does not accept
it, because nobody read that token when they approved the term.

The built-in tiers keep their authority: generic verbs (`process`, `handle`),
boolean prefixes (`is`, `has`) and meaningless placeholders (`temp`, `foo`) are
never promoted, and deprecated synonyms, `template` entries and `stale` terms are
never vocabulary. Only the *committed* file counts — a run cannot expand its own
vocabulary.

```ts
import { projectVocabulary } from "@narrativetrace/vitest";

analyzeClarity(tree, projectVocabulary());   // NARRATIVETRACE_GLOSSARY_DIR, default "."
```

The Vitest fixture already passes it. Reading is unconditional, unlike harvesting
(`NARRATIVETRACE_GLOSSARY=true`), and a glossary that cannot be read degrades to
the built-in dictionaries with a warning rather than failing the suite.

### renderClarityReport(scenarios)

Renders a Markdown clarity report:

```ts
import { renderClarityReport, type ScenarioResult } from "@narrativetrace/clarity";

const report = renderClarityReport([
  { scenario: "Order placement", result },
]);
```

### exportClarityJson / exportClarityJsonReport

JSON export for tooling:

```ts
import { exportClarityJson, exportClarityJsonReport } from "@narrativetrace/clarity";

const json = exportClarityJson(result, { scenario: "Order placement" });
const reportJson = exportClarityJsonReport(scenarios);
```

### NLP components (all exported)

```ts
import {
  tokenize,                    // IdentifierTokenizer
  classifyVerb, type VerbCategory,
  classifyToken, type TokenTier, tokenTierScore,
  classifyAbbreviation, abbreviationScore, type AbbreviationTier,
  analyzeMorphology, type PartOfSpeech,
  hasNoun, isValidCollocation,
  expectedVerbsForRole,
  scoreClassName,
  scoreMethodName,
  scoreParameterName,
  scoreCohesion,
  scoreStructural, type StructuralInput,
} from "@narrativetrace/clarity";
```

---

## Browser API Reference

### renderToConsole(tree)

Renders a trace tree to the browser DevTools console using `console.group()`:

```ts
import { renderToConsole } from "@narrativetrace/browser";

renderToConsole(context.captureTrace());
```

### postToCollector(tree, url)

POSTs the trace tree as JSON to a collector endpoint:

```ts
import { postToCollector } from "@narrativetrace/browser";

await postToCollector(context.captureTrace(), "https://collector.example.com/traces");
```

---

## Framework Integrations

<!-- framework-table:begin -->
### Framework table — what the doctor checks

Rendered from the doctor's own framework table, which ships inside `@narrativetrace/tooling`. For every row it can observe, `narrativetrace doctor` runs the named check: the framework is detected but its integration is not installed, or installed but never wired — and the failing fix prints the install line (with the project's own package manager and NarrativeTrace version) and the wiring below. A framework with no integration shipped is reported as such, so an agent leaves it alone rather than guessing one.

| Framework | Detected by | Install (npm) | Wiring | Doctor check |
|---|---|---|---|---|
| Vitest | a vitest dependency | `npm install --save-dev @narrativetrace/vitest@0.3.0 @narrativetrace/proxy@0.3.0` | a test built with `createNarrativeTest()`, or a NarrativeTrace reporter in `vitest.config` | `config.vitest-fixture` |
| Express | an express dependency | `npm install @narrativetrace/express@0.3.0 @narrativetrace/core@0.3.0 @narrativetrace/core-node@0.3.0 @narrativetrace/observability@0.3.0` | `app.use(narrativeTrace(…))` before the routes, printing each request's trace | `config.express-middleware` |
| Hono | a hono dependency | `npm install @narrativetrace/hono@0.3.0 @narrativetrace/core@0.3.0 @narrativetrace/core-node@0.3.0 @narrativetrace/observability@0.3.0` | `app.use("*", narrativeTrace(…))` before the routes, printing each request's trace | `config.hono-middleware` |
| NestJS | an @nestjs/core dependency | `npm install @narrativetrace/nestjs@0.3.0 @narrativetrace/core@0.3.0 @narrativetrace/core-node@0.3.0 @narrativetrace/observability@0.3.0` | `AutoProxyModule.forRoot({ onRequestComplete })` in the root module's imports | `config.nestjs-module` |
| Angular | an @angular/core dependency | `npm install @narrativetrace/angular@0.3.0 @narrativetrace/core@0.3.0 @narrativetrace/proxy@0.3.0` | `provideNarrativeTrace()` in the application config's providers | `config.angular-provider` |
| React | a react dependency | `npm install @narrativetrace/react@0.3.0 @narrativetrace/core@0.3.0 @narrativetrace/core-web@0.3.0 @narrativetrace/proxy@0.3.0` | `<NarrativeTraceProvider>` around the app | `config.react-provider` |
| React Router | a react-router or react-router-dom dependency | `npm install @narrativetrace/react-router@0.3.0 @narrativetrace/react@0.3.0 @narrativetrace/core@0.3.0` | a component calling `useNavigationCapture(…)`, rendered inside the router and the provider | `config.react-router-capture` |
| Pino | a pino dependency | `npm install @narrativetrace/pino@0.3.0 @narrativetrace/core@0.3.0 @narrativetrace/observability@0.3.0` | a pipeline built from this project's pino logger, passed to its narrative context | `config.pino-consumer` |
| Winston | a winston dependency | `npm install @narrativetrace/winston@0.3.0 @narrativetrace/core@0.3.0 @narrativetrace/observability@0.3.0` | a pipeline built from this project's winston logger, passed to its narrative context | `config.winston-consumer` |
| OpenTelemetry | an @opentelemetry/api dependency | `npm install @narrativetrace/opentelemetry@0.3.0 @narrativetrace/core@0.3.0` | a pipeline built from this project's tracer, passed to its narrative context | `config.opentelemetry-consumer` |
| Default logger (Pino) | no logger: none of pino, winston or @opentelemetry/api is declared | `npm install @narrativetrace/pino@0.3.0 @narrativetrace/core@0.3.0 @narrativetrace/observability@0.3.0 pino` | a pipeline built from this project's pino logger, passed to its narrative context | `trap.silent-sink` (existing) |
| Fastify | a fastify dependency | — | no NarrativeTrace integration is shipped for it | `config.fastify-integration` (reports it) |
| Koa | a koa dependency | — | no NarrativeTrace integration is shipped for it | `config.koa-integration` (reports it) |

#### Vitest — wiring

<!-- snippet: packages/vitest/__tests__/wiring/order-service.test.ts -->
```ts
import { traceObject } from "@narrativetrace/proxy";
import { createNarrativeTest } from "@narrativetrace/vitest";
import { expect } from "vitest";
import { OrderService } from "./order-service.js";

const narrativeTest = createNarrativeTest();

narrativeTest("places an order", ({ narrativeContext }) => {
  const orders = traceObject(new OrderService(), narrativeContext, {
    placeOrder: ["customerId", "quantity"],
  });

  orders.placeOrder("C-1", 2);

  expect(narrativeContext.captureTrace().roots).toHaveLength(1);
});
```
<!-- /snippet -->

#### Express — wiring

<!-- snippet: packages/express/__tests__/wiring/narrative-trace.ts -->
```ts
import { NarrativeTraceConfig, renderIndentedText } from "@narrativetrace/core-node";
import { createExpressNarrativeContext, narrativeTrace } from "@narrativetrace/express";
import type { Express } from "express";

/**
 * Call once, before your routes. Trace each service with the context it returns, so every
 * request prints its own trace: traceObject(new OrderService(), narrativeContext, …).
 */
export function addNarrativeTrace(app: Express) {
  const narrativeContext = createExpressNarrativeContext(new NarrativeTraceConfig());
  app.use(
    narrativeTrace(narrativeContext, {
      onRequestComplete(_request, _response, context) {
        console.log(renderIndentedText(context.captureTrace()));
      },
    }),
  );
  return narrativeContext;
}
```
<!-- /snippet -->

#### Hono — wiring

<!-- snippet: packages/hono/__tests__/wiring/narrative-trace.ts -->
```ts
import { NarrativeTraceConfig, renderIndentedText } from "@narrativetrace/core-node";
import { createHonoNarrativeContext, narrativeTrace } from "@narrativetrace/hono";
import type { Hono } from "hono";

/**
 * Call once, before your routes. Trace each service with the context it returns, so every
 * request prints its own trace: traceObject(new OrderService(), narrativeContext, …).
 */
export function addNarrativeTrace(app: Hono) {
  const narrativeContext = createHonoNarrativeContext(new NarrativeTraceConfig());
  app.use(
    "*",
    narrativeTrace(narrativeContext, {
      onRequestComplete(_c, context) {
        console.log(renderIndentedText(context.captureTrace()));
      },
    }),
  );
  return narrativeContext;
}
```
<!-- /snippet -->

#### NestJS — wiring

<!-- snippet: packages/nestjs/__tests__/wiring/narrative-trace.module.ts -->
```ts
import { type NarrativeContext, renderIndentedText } from "@narrativetrace/core-node";
import { AutoProxyModule, type NestRequestCompletion } from "@narrativetrace/nestjs";

function onRequestComplete(_context: NarrativeContext, completion: NestRequestCompletion): void {
  console.log(renderIndentedText(completion.tree));
}

/**
 * Add it to your root module's imports, next to what is already there. Every provider is then
 * traced, and every request prints its own trace once the response is sent.
 */
export const NarrativeTraceModule = AutoProxyModule.forRoot({ onRequestComplete });
```
<!-- /snippet -->

#### Angular — wiring

<!-- snippet: packages/angular/__tests__/wiring/app.config.ts -->
```ts
import type { ApplicationConfig } from "@angular/core";
import { provideNarrativeTrace } from "@narrativetrace/angular";
import { renderIndentedText, type TraceTree } from "@narrativetrace/core";

/**
 * Add the provider to your application config, next to provideRouter. Register each service to
 * trace with provideTraced(OrderService), and every navigation prints its own trace.
 */
export const appConfig: ApplicationConfig = {
  providers: [
    provideNarrativeTrace({
      captureOnNavigation: true,
      onTraceCapture(tree: TraceTree) {
        console.log(renderIndentedText(tree));
      },
    }),
  ],
};
```
<!-- /snippet -->

#### React — wiring

<!-- snippet: packages/react/__tests__/wiring/root.tsx -->
```tsx
import { NarrativeTraceProvider } from "@narrativetrace/react";
import type { ReactNode } from "react";

/**
 * Wrap your whole app once, where it is rendered: <NarrativeTraceRoot><App /></NarrativeTraceRoot>.
 * Inside it, useTraced traces a service and useTraceCapture hands back what it recorded.
 */
export function NarrativeTraceRoot({ children }: { children: ReactNode }) {
  return <NarrativeTraceProvider>{children}</NarrativeTraceProvider>;
}
```
<!-- /snippet -->

#### React Router — wiring

<!-- snippet: packages/react-router/__tests__/wiring/navigation-tracer.tsx -->
```tsx
import { renderIndentedText } from "@narrativetrace/core";
import { useNavigationCapture } from "@narrativetrace/react-router";

/**
 * Render it once, inside both your router and <NarrativeTraceProvider>, next to your routes.
 * Every navigation then prints the trace of the page it leaves.
 */
export function NavigationTracer() {
  useNavigationCapture((tree) => console.log(renderIndentedText(tree)));
  return null;
}
```
<!-- /snippet -->

#### Pino — wiring

<!-- snippet: packages/pino/__tests__/wiring/narrative-pipeline.ts -->
```ts
import { BufferedEventConsumer, DualPathPipeline } from "@narrativetrace/core";
import { createPinoEventConsumer } from "@narrativetrace/pino";
import type { Logger } from "pino";

/**
 * Build it from this project's own pino logger, and pass it wherever the project creates its
 * narrative context: new AsyncNarrativeContext(config, narrativePipeline(logger)), or a framework
 * integration's pipeline option. Every traced call is then a log line, and captureTrace() still
 * works.
 */
export function narrativePipeline(logger: Logger) {
  const levels = { enter: "info", return: "info", exception: "error" } as const;
  return new DualPathPipeline(
    createPinoEventConsumer(logger, { levels }),
    new BufferedEventConsumer(),
  );
}
```
<!-- /snippet -->

#### Winston — wiring

<!-- snippet: packages/winston/__tests__/wiring/narrative-pipeline.ts -->
```ts
import { BufferedEventConsumer, DualPathPipeline } from "@narrativetrace/core";
import { createWinstonEventConsumer } from "@narrativetrace/winston";
import type { Logger } from "winston";

/**
 * Build it from this project's own winston logger, and pass it wherever the project creates its
 * narrative context: new AsyncNarrativeContext(config, narrativePipeline(logger)), or a framework
 * integration's pipeline option. Every traced call is then a log line, and captureTrace() still
 * works.
 */
export function narrativePipeline(logger: Logger) {
  const levels = { enter: "info", return: "info", exception: "error" } as const;
  return new DualPathPipeline(
    createWinstonEventConsumer(logger, { levels }),
    new BufferedEventConsumer(),
  );
}
```
<!-- /snippet -->

#### OpenTelemetry — wiring

<!-- snippet: packages/opentelemetry/__tests__/wiring/narrative-pipeline.ts -->
```ts
import { BufferedEventConsumer, DualPathPipeline } from "@narrativetrace/core";
import { createOtelEventConsumer } from "@narrativetrace/opentelemetry";
import type { Tracer } from "@opentelemetry/api";

/**
 * Build it from this project's own tracer, trace.getTracer("orders"), and pass it wherever the
 * project creates its narrative context: new AsyncNarrativeContext(config, narrativePipeline(tracer)),
 * or a framework integration's pipeline option. Every traced call is then a span, and
 * captureTrace() still works.
 */
export function narrativePipeline(tracer: Tracer) {
  return new DualPathPipeline(createOtelEventConsumer({ tracer }), new BufferedEventConsumer());
}
```
<!-- /snippet -->
<!-- framework-table:end -->

---

## Runtime Adapters API Reference

Every adapter opens one trace context per request or navigation and hands the captured tree to a completion callback; none of them fails the request when an extractor or callback throws. Server adapters pair with `AsyncNarrativeContext` from `@narrativetrace/core-node`, so concurrent requests never share a trace. The [Framework Integration Guide](framework-integration-guide.md) has the complete paths.

### Express — `@narrativetrace/express`

```ts
import { getNarrativeContext, narrativeTrace } from "@narrativetrace/express";

app.use(narrativeTrace(ctx, { excludedPaths: ["/health"], onRequestComplete }));
```

`narrativeTrace(ctx, options)` is middleware. Options: `excludedPaths` (no context or log scope for those paths), `extractRequest`, `extractUser`, and `onRequestComplete(req, res, ctx, { statusCode, durationMs })`, which fires on the response's `finish`. `getNarrativeContext(req)` returns the request's active context inside a handler.

### Hono — `@narrativetrace/hono`

```ts
import { getNarrativeContext, narrativeTrace } from "@narrativetrace/hono";

app.use("*", narrativeTrace(ctx, { excludedPaths: ["/health"], onRequestComplete }));
```

The same options, with `onRequestComplete(c, ctx, { statusCode, durationMs })` fired in a `finally`, so it runs even when the handler throws. `clientIp` is `"unknown"` unless you opt in with `withConnInfoClientIp(getConnInfo)`: the default extractor never trusts `x-forwarded-for`.

### NestJS — `@narrativetrace/nestjs`

`AutoProxyModule.forRoot({ serviceName, level, pipeline, exclude, onRequestComplete })` is a global module that proxies every provider so each service call is captured. `onRequestComplete(ctx, { statusCode, durationMs, tree })` receives the captured tree. `@NoAutoProxy()` opts one provider out; `NarrativeStorage` is the exported per-request context holder. Without a real `pipeline`, traces are captured but not exported.

### Angular — `@narrativetrace/angular`

`provideNarrativeTrace({ captureOnNavigation, onTraceCapture })` wires the DI context, the `traceInterceptor` (outgoing `HttpClient` requests carry the trace context) and optional per-navigation capture. `provideTraced(Service)` registers each service to trace. `TraceCaptureService` and the `NARRATIVE_CONTEXT` token capture traces manually.

### React — `@narrativetrace/react`

`NarrativeTraceProvider` supplies the context; `useTraced(factory, name)` returns a traced service; `useTraceCapture()` returns `captureAndReset`, which yields the accumulated tree. `useNarrativeTrace()` returns the raw context, and `useTracedFetch()` returns a `fetch` that stamps `traceparent` on outgoing requests.

### React Router — `@narrativetrace/react-router`

`useNavigationCapture(callback?)` captures a fresh tree on every pathname change, passes it to the optional callback, and resets the context. It must sit inside a `NarrativeTraceProvider` and a React Router context.

---

## Observability API Reference

These packages send what the trace already knows to the logging and tracing tools a project has. All of them take a pipeline consumer: put it in a `DualPathPipeline` beside a `BufferedEventConsumer`, which keeps `captureTrace()` and `events()` working.

### Log enrichment — `@narrativetrace/observability`

`createEnricherEventConsumer()` keeps the active trace identity (`code.*`, `trace_id`, `service.*`, `nt.depth`) in a scoped `LogContext`; `createLogEnricher(callback)` adapts that context to any logger. `withRequestTrace(context, request, fn)` opens a per-request scope and seeds the `nt.http.*` and `nt.enduser.id` fields (`buildRequestLogValues`, `RequestInfo`) for the handler. `@narrativetrace/winston` and `@narrativetrace/pino` build on this same `LogContext`.

### OpenTelemetry — `@narrativetrace/opentelemetry`

`createOtelEventConsumer({ tracer, maxActiveSpans })` is the live bridge: it starts and ends spans as methods execute, nests child spans under their parent, and stamps `nt.*` attributes and typed `narrative.param.<name>` values. `new TraceSpanExporter(tracer).export(roots)` turns an already captured tree into nested spans in one pass. The span-attribute mappers (`setSpanAttributes`, `setOutcomeAttributes`, `buildEventAttributes`) are exported for custom exporters.

### Winston — `@narrativetrace/winston`

`createWinstonEventConsumer(logger, { levels })` writes one line per `enter` and `exit` event (`→ Class.method`, `← returned: …`, `!! Error`) with typed fields. Entry and return default to `debug`, exceptions to `warn`; `levels: { enter, return, exception }` overrides each. `createWinstonFormat()` merges the current `LogContext` into the lines of your own `logger.*` calls.

### Pino — `@narrativetrace/pino`

`createPinoEventConsumer(logger, { levels })` writes the same lines; entry and return default to `trace`, exceptions to `warn`. `createPinoMixin()`, passed as the logger's `mixin`, merges the current `LogContext` into every line.

---

## Configuration

### NarrativeTraceConfig

```ts
const config = new NarrativeTraceConfig();          // default: "detail"
const config = new NarrativeTraceConfig("narrative"); // explicit level

config.level;            // get current level
config.level = "errors"; // change at runtime
```

### ProxyOptions

```ts
type ProxyOptions = {
  readonly className?: string;           // default: target.constructor.name
  readonly includeReturnValues?: boolean; // default: true
};
```

### MarkdownOptions

```ts
type MarkdownOptions = {
  readonly scenarioName?: string;      // appears in YAML frontmatter
  readonly slowThresholdMs?: number;   // default: 200
};
```

### RenderOptions (for renderValue)

```ts
type RenderOptions = {
  readonly maxStringLength?: number;  // default: 200
  readonly maxArrayItems?: number;    // default: 5
  readonly maxObjectKeys?: number;    // default: 5
};
```

### NarrativeTestOptions (for Vitest)

```ts
type NarrativeTestOptions = {
  readonly outputDir?: string;       // default: "narrativetrace-output"
  readonly formats?: TraceFormat[];  // default: ["md"]
};

type TraceFormat = "md" | "mmd" | "json" | "puml" | "clarity-json" | "canonical-json";
// "json"           -> <test>.json           nested chapter-tree envelope (version 1.0)
// "canonical-json" -> <test>.canonical.json flat entry list (nt.schemaVersion 1.2),
//                                           validated by schema/entry.schema.json
```

---

## Architecture Decisions

### Eager serialization

All parameter values and return values are serialized to strings at capture time (in the proxy), not at render time. This means:

- The context and renderers only see strings — never raw objects
- No risk of objects changing state between capture and render
- `ParameterCapture.renderedValue` and `Returned.renderedValue` are pre-rendered strings

### Stack-based context

`SyncNarrativeContext` uses an internal array-based call stack rather than a shared concurrent data structure. This gives:
- Simple, predictable behavior
- Natural isolation per context instance
- Cross-async-boundary propagation via `AsyncLocalStorage` (Node) or `snapshot()` (browser)

### Frozen immutable data

All data types (`TraceNode`, `MethodSignature`, `ParameterCapture`, `TraceOutcome`, `TraceTree`) are created via factory functions that return `Object.freeze()`-ed objects. Arrays within these objects are also frozen. This prevents accidental mutation after capture.

### ES Proxy vs class decoration

NarrativeTrace uses ES `Proxy` to intercept method calls on arbitrary objects rather than requiring base class inheritance or interface implementation. This means:
- Any object with methods can be traced — classes, plain objects, even objects from third-party libraries
- No source code changes required (decorators are optional enhancements)
- Getter properties are detected and passed through without tracing
- ES `#private` methods cannot be intercepted (JavaScript language limitation)

### Zero runtime dependencies in core

`@narrativetrace/core` has zero external dependencies. All types — context, events, renderers, config — use only Node.js built-in APIs. This ensures NarrativeTrace can be added to any project without dependency conflicts.

---

## Troubleshooting

### Parameters show as arg0, arg1

**Cause:** No parameter names provided.

**Fix:** Either use `@traced("name1", "name2")` decorators or pass parameter names to `traceObject()`:
```ts
const traced = traceObject(service, context, {
  placeOrder: ["customerId", "productId", "quantity"],
});
```

### No trace output files

**Cause:** Using `narrativeTest` instead of `createNarrativeTest`.

**Fix:** Use `createNarrativeTest` with output configuration:
```ts
const test = createNarrativeTest({
  outputDir: "narrativetrace-output",
  formats: ["md"],
});
```

### Async calls not captured in trace

**Cause:** Async method returns a Promise; the proxy handles `.then()` and `.catch()` to capture outcomes.

**Fix:** Ensure your method returns a Promise (async methods do this automatically). The proxy detects thenables and wires up trace capture on resolution/rejection.

### Getter properties being traced as methods

**Cause:** Fixed — getter properties are detected and passed through. If you see this, update to the latest version.

### Clarity score seems wrong

**Cause:** Likely using generic names that the NLP analysis flags (get/set/process/handle/data/info/temp).

**Fix:** Review the issues list in the clarity report. Replace generic names with domain-specific alternatives. Example: `getData()` → `fetchOrderHistory()`.

### Cross-request traces mixing in Express/Hono

**Cause:** Using `SyncNarrativeContext` instead of `AsyncNarrativeContext`.

**Fix:** Use `AsyncNarrativeContext` with `run()` per request:
```ts
app.use((req, res, next) => {
  asyncContext.run(() => next());
});
```

---

## API Quick Reference

### Essential imports

```ts
// Core
import {
  NarrativeTraceConfig,
  SyncNarrativeContext,
  AsyncNarrativeContext,
  NOOP_CONTEXT,
  type NarrativeContext,
  type TracingLevel,
  isActiveLevel,
  isEnabled,
  type TraceTree,
  type TraceNode,
  type TraceOutcome,
  type Returned,
  type Threw,
  type MethodSignature,
  type ParameterCapture,
  renderIndentedText,
  renderMarkdown,
  renderProse,
  renderValue,
  exportJson,
  frameScenario,
  hasAnyError,
} from "@narrativetrace/core";

// Proxy
import { traceObject, traced, narrated, onError, notTraced } from "@narrativetrace/proxy";

// Vitest
import { narrativeTest, createNarrativeTest, writeTraceOutput } from "@narrativetrace/vitest";

// Diagrams
import { renderMermaidSequence, renderPlantUmlSequence } from "@narrativetrace/diagrams";

// Clarity
import { analyzeClarity, renderClarityReport, exportClarityJson, exportClarityJsonReport } from "@narrativetrace/clarity";

// Browser
import { renderToConsole, postToCollector } from "@narrativetrace/browser";
```

### Minimal working example

```ts
import { NarrativeTraceConfig, SyncNarrativeContext, renderIndentedText } from "@narrativetrace/core";
import { traceObject } from "@narrativetrace/proxy";

const context = new SyncNarrativeContext(new NarrativeTraceConfig());
const traced = traceObject(orderService, context, {
  placeOrder: ["customerId", "productId", "quantity"],
});

traced.placeOrder("C1", "P1", 2);
console.log(renderIndentedText(context.captureTrace()));
context.reset();
```

Output:
```
OrderService.placeOrder(customerId: "C1", productId: "P1", quantity: 2)
  CustomerService.findCustomer(customerId: "C1") -> {"id": "C1", "name": "Alice", "tier": "gold"}
  ProductCatalogService.lookupPrice(productId: "P1") -> 29.99
  InventoryService.reserve(productId: "P1", quantity: 2) -> {"productId": "P1", "quantity": 2}
  PaymentService.charge(customerId: "C1", amount: 59.98) -> {"transactionId": "TX-1", "amount": 59.98}
-> {"orderId": "ORD-1", "transactionId": "TX-1", "totalCharged": 59.98, "itemCount": 2}
```
