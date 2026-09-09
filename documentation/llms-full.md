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
pnpm add @narrativetrace/core @narrativetrace/proxy
```

### 2. Trace an object

```ts
import { NarrativeTraceConfig, SyncNarrativeContext, renderIndentedText } from "@narrativetrace/core";
import { traceObject } from "@narrativetrace/proxy";

const context = new SyncNarrativeContext(new NarrativeTraceConfig());
const traced = traceObject(orderService, context);

traced.placeOrder("C1", "P1", 2);
console.log(renderIndentedText(context.captureTrace()));
```

### 3. With Vitest

```bash
pnpm add -D @narrativetrace/vitest
```

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

The central interface for recording trace events. All tracing flows through this.

```ts
interface NarrativeContext {
  readonly isActive: boolean;
  enterMethod(
    className: string,
    methodName: string,
    params: readonly ParameterCapture[],
    options?: { narration?: string; errorContext?: string },
  ): void;
  exitMethodWithReturn(renderedValue: string | null): void;
  exitMethodWithException(error: unknown): void;
  captureTrace(): TraceTree;
  reset(): void;
}
```

**Key methods:**
- `enterMethod(className, methodName, params, options)` — push a frame. Must have a matching exit call.
- `exitMethodWithReturn(rendered)` — pop frame, record success. The value is pre-rendered to string.
- `exitMethodWithException(error)` — pop frame, record failure.
- `captureTrace()` — return the immutable trace tree.
- `reset()` — clear all state. Call between tests/requests.

**Implementations:**
- `SyncNarrativeContext` — default, zero-dependency, stack-based
- `AsyncNarrativeContext` — wraps `AsyncLocalStorage<SyncNarrativeContext>` for per-request isolation
- `NOOP_CONTEXT` — discards everything (for disabled tracing)

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

A configured axis overrides the same method's decorator metadata; an absent axis keeps the decorator's declaration. A plain string `onError` is the catch-all shorthand.

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
  moduleName: "order-service", // groups artifacts, like Java's test-class directory
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
