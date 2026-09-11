# NarrativeTrace™

**English** | [Español](LEAME.md) | [Português](LEIAME.md) | [简体中文](自述文件.md)

> Code is the log.

Zero-code logging that uses your method and parameter names as the log. If the trace is unreadable, your code needs refactoring — not more log statements.

In a hurry: [try it locally](#try-it-locally) → [add it to one test](#add-it-to-one-test) → [pick your integration](#choose-your-integration).

## The problem

Half of this method is logging noise:

```ts
placeOrder(customerId: string, productId: string, quantity: number): OrderResult {
  console.log(`Placing order for customer ${customerId} product ${productId} quantity ${quantity}`);

  const customer = this.customers.findCustomer(customerId);
  console.log('Found customer:', customer);

  const price = this.catalog.lookupPrice(productId);
  console.log('Looked up price:', price);

  this.inventory.reserve(productId, quantity);
  console.log('Reserved inventory');

  const confirmation = this.payments.charge(customerId, price * quantity);
  console.log('Payment processed:', confirmation.transactionId);

  const result = { orderId: 'ORD-1', transactionId: confirmation.transactionId, totalCharged: price * quantity, itemCount: quantity };
  console.log('Order placed:', result);
  return result;
}
```

The business logic is five lines. The logging is another six. Every developer writes these logs differently — different messages, different levels, different included values. The result is inconsistent, verbose, and tangled with the code it describes.

NarrativeTrace eliminates this entirely:

```ts
placeOrder(customerId: string, productId: string, quantity: number): OrderResult {
  this.customers.findCustomer(customerId);
  const price = this.catalog.lookupPrice(productId);
  this.inventory.reserve(productId, quantity);
  const confirmation = this.payments.charge(customerId, price * quantity);
  return { orderId: 'ORD-1', transactionId: confirmation.transactionId, totalCharged: price * quantity, itemCount: quantity };
}
```

Pure business logic. The trace is generated automatically from the method names, parameter names, and return values — the information that was already there.

## Code–log drift

Log statements are the one part of a codebase with no compiler check and, in practice, no test coverage — so they silently stop being true as the code changes. A rename leaves the message describing the old name; an added step is simply never mentioned; a unit change (cents → euros) leaves `total` describing a different number. Nothing catches it: log text is rarely asserted, and where it is, the assertion is brittle and gets deleted first. A stale log is worse than none — in an incident it is read as evidence of what happened, when it is a sentence someone wrote once about code that has since changed.

> **Code–log drift, eliminated by construction.** A log line is a claim about code, written once and never checked again. A narrative trace is derived from the run — so there is nothing to drift.

To be precise: a narration template (`@narrated`) is still a hand-written string, and a renamed parameter can break its placeholder — which is exactly why it is the exception here, not the standard path (see the [Decorators Guide](documentation/decorators-guide.md)). Everything else in a trace — the calls, arguments, and outcomes — is derived, never written, so there is nothing there to go stale. And because a trace is structural, a genuine behavior change becomes something a reviewer can diff, not a sentence that silently stopped matching the code.

## What you get instead

Run your code and get execution traces like this:

```
OrderService.placeOrder(customerId: "C1", productId: "P1", quantity: 2)
  CustomerService.findCustomer(customerId: "C1") -> {"id": "C1", "name": "Alice", "tier": "gold"}
  ProductCatalogService.lookupPrice(productId: "P1") -> 29.99
  InventoryService.reserve(productId: "P1", quantity: 2) -> {"productId": "P1", "quantity": 2}
  PaymentService.charge(customerId: "C1", amount: 59.98) -> {"transactionId": "TX-1", "amount": 59.98}
-> {"orderId": "ORD-1", "transactionId": "TX-1", "totalCharged": 59.98, "itemCount": 2}
```

## When something goes wrong

The trace makes bugs visible:

```
OrderService.placeOrder(customerId: "C3", productId: "P1", quantity: 3)
  CustomerService.findCustomer(customerId: "C3") -> {"id": "C3", "name": "Charlie", "tier": "platinum"}
  ProductCatalogService.lookupPrice(productId: "P1") -> 29.99
  InventoryService.reserve(productId: "P1", quantity: 3) -> {"productId": "P1", "quantity": 3}
  PaymentService.charge(customerId: "C3", amount: 89.97) !! Error: Payment declined for customer: C3
!! Error: Payment declined for customer: C3
```

`InventoryService.reserve` was called but `InventoryService.release` is nowhere in the trace. The bug is visible.

## The trace is only as good as your names

The same Minecraft "player joins world" flow, traced twice — once with domain names, once with generic names:

**Refactored (clean names):**
```
WorldServer.playerJoined(playerName: "Steve")
  WorldGenerator.generateChunk(x: 0, z: 0) -> {"x": 0, "z": 0, "biome": "plains", "blockCount": 65536}
  PlayerInventory.addItem(item: {"name": "oak_log", "quantity": 4}, quantity: 4) -> true
  CraftingTable.craft(recipe: {"name": "oak_planks", "ingredients": [{"name": "oak_log", "quantity": 4}]}) -> {"name": "oak_planks", "quantity": 1}
  CreatureSpawner.spawnHostile(type: "zombie", x: 10, y: 64, z: 10) -> {"type": "zombie", "x": 10, "y": 64, "z": 10, "health": 20}
-> "Steve joined the world in plains biome"
```

**Unrefactored (generic names):**
```
GameManager.handle(input: "Steve")
  DataProcessor.process(a: 0, b: 0) -> {"a": 0, "b": 0, "label": "plains", "count": 65536}
  StateManager.update(item: {"name": "oak_log", "quantity": 4}, quantity: 4) -> true
  ThingFactory.create(recipe: {"name": "oak_planks", "ingredients": [{"name": "oak_log", "quantity": 4}]}) -> {"name": "oak_planks", "quantity": 1}
  EntityHandler.execute(kind: "zombie", a: 10, b: 64, c: 10) -> {"kind": "zombie", "a": 10, "b": 64, "c": 10, "value": 20}
-> "Steve joined the world in plains biome"
```

Same call graph. Same return values. Only names differ. If your code can't tell its own story, it needs refactoring — which is why NarrativeTrace also [scores your naming](#clarity-scoring).

## Why this matters for AI-assisted development

Every `console.log(...)` or `logger.trace(...)`/`logger.debug(...)`/`logger.info(...)` line is a line that AI coding tools have to parse, spend tokens on, and reason around. In a typical service class, logging is 30–50% of the lines. Remove those lines and you get:

- **More business logic per context window** — the same token budget covers more of your actual code.
- **Cleaner reasoning** — AI sees what the code does, not how it logs what it does.
- **Signal-only diffs** — pull requests show business logic changes, not mixed logic-and-logging changes.

That's not a vague benefit — it's measurable in tokens.

## Clarity scoring

If the trace *is* the code, then trace quality *is* code quality. NarrativeTrace includes a clarity analyzer that scores your method, class, and parameter names:

```
## Clarity Report — Order Placement
Overall: 0.92 (high)

| Element     | Score | Note                    |
|-------------|-------|-------------------------|
| placeOrder  | 1.00  | Strong verb + object    |
| customerId  | 1.00  | Domain-specific noun    |
| processData | 0.30  | Generic verb + generic noun |
```

Generic names like `processData`, `handleRequest`, `result` score low. Domain-specific names like `reserveInventory`, `customerId` score high. The clarity report is generated automatically once you write it to a Vitest run — see [First 10 Minutes](documentation/first-10-minutes.md#6-rename-placeorder-to-process-and-watch-clarity-drop) for a real before/after.

Clarity scoring is still experimental.

## How it compares

If you're in an enterprise stack, you're usually running:

- centralized log platforms (Datadog, ELK, Cloud Logging)
- distributed tracing backends (OpenTelemetry, Jaeger, Tempo)
- alerts and SLO dashboards

NarrativeTrace is designed to replace manual application logging in production. You keep your existing sinks and pipelines; NarrativeTrace becomes the source of application events.

| Concern | Enterprise logging stack | NarrativeTrace |
|---------|--------------------------|----------------|
| Primary goal | Operability, incident response, compliance | Same production goal, but generated directly from code structure |
| Data model | Hand-authored events + fields + spans + metrics | Method-call narratives with named parameters, return values, and errors |
| Instrumentation style | Manual `logger.*` calls + telemetry wiring | Auto-generated capture, then export to existing enterprise sinks |
| Best at | Centralized search, retention, alerting | High-fidelity, low-drift application events without logging boilerplate |
| Weak spot | Event quality depends on human-written log statements | Requires naming discipline to keep traces clear |

Manual `console.log` is the weakest baseline: scattered, inconsistent, and mixed into business logic. NarrativeTrace removes that logging noise by deriving the trace from code structure.

Production model:

- keep your current observability platform and alerts
- replace manual app logging statements with NarrativeTrace capture
- route NarrativeTrace output to the same sinks your org already operates

**OpenTelemetry bridge:** `@narrativetrace/opentelemetry` maps narratives onto OTel spans — a live
`createOtelEventConsumer` that starts/ends spans as methods execute, and a batch `TraceSpanExporter`
that turns a captured tree into nested spans post-hoc. Every span carries `nt.trace_id`/`nt.*`
schema attributes and typed `narrative.param.<name>` values, so your existing Jaeger/Tempo/Datadog
trace views light up without hand-instrumented spans. Log enrichers (`winston`, `pino`,
`observability`) stamp `trace_id`, `service.*`, and `nt.depth` onto every line for the same
correlation.

## What NarrativeTrace replaces (and what it doesn't)

NarrativeTrace replaces the narration statements you write by hand to describe a call — not your logging stack:

```ts
logger.info(`Placing order for customer ${customerId} product ${productId}`);
```

That line disappears; the method call already carries the information. By default nothing else changes: no logger is touched at all — a capture is buffered in-process and exported via `captureTrace()` (Markdown/JSON/prose files), or pretty-printed post-hoc with `renderToConsole` in the browser.

Wire in `@narrativetrace/pino` or `@narrativetrace/winston` and NarrativeTrace becomes a live emitter: `createPinoEventConsumer`/`createWinstonEventConsumer` call your own `Logger` instance directly (`logger.trace()`/`logger.warn()`, configurable per event), so every transport, formatter, and shipping destination you already configured keeps working, untouched — NarrativeTrace is one more caller of your logger, not a replacement for it. Manual logging you keep writing on purpose — an audit line, a business metric, anything that isn't just narrating control flow — runs on the same logger, interleaved with NarrativeTrace's own lines. Want correlation without generating any lines at all? `@narrativetrace/observability`'s `createLogEnricher` stamps `trace_id`/`nt.*` fields onto the logger calls you still write by hand; it never emits on its own.

## Try it locally

No project, no wiring — the repository ships a demo launcher that runs the example applications and narrates them live (the first run needs a build):

```bash
pnpm install                                   # once
pnpm run build && pnpm demo                    # interactive picker: ecommerce, clarity, minecraft, plain-js
pnpm demo -- --example ecommerce               # six scenarios, live → ← !! stream, a stop point per scenario
pnpm demo -- --example ecommerce --classic     # the same run as timestamped logs through the winston bridge
pnpm demo -- --example ecommerce --lang es     # the same run re-rendered through the example's glossary.json
```

Every scenario opens with a note on how its trace is wired — decorators, `traceObject`, fork/join —
and each rendering (tree, prose, Mermaid, PlantUML) is announced as its own section. Details in the
[Examples Guide](documentation/examples-guide.md#demo-launcher).

## Add it to one test

The shortest path from "interesting library" to "I saw a useful trace of my own code" is the Vitest fixture. Node 20+ (CI runs 22), TypeScript 5.0+ if you use the decorators below.

```bash
pnpm add @narrativetrace/core-node @narrativetrace/proxy
pnpm add -D @narrativetrace/vitest
```

npm publication is in preparation — until the packages are on the registry,
build them from this repository (see [Building from source](#building-from-source)).

```ts
// order-service.test.ts
import { traceObject } from "@narrativetrace/proxy";
import { createNarrativeTest } from "@narrativetrace/vitest";
import { OrderService } from "./order-service.js";

const test = createNarrativeTest();

test("customer places order", ({ narrativeContext }) => {
  const service = traceObject(new OrderService(), narrativeContext, {
    placeOrder: ["customerId", "productId", "quantity"],
  });

  service.placeOrder("C1", "P1", 2);
});
```

Run `npx vitest run` and open `narrativetrace-output/order-service/customer_places_order.md` — the
test name became the scenario name, no interface or build-tool plugin required (`traceObject` wraps
the concrete object directly).

Want to keep going — rename the method and watch the clarity score drop, add `@notTraced` and see a
value redacted? → [First 10 Minutes](documentation/first-10-minutes.md) walks all seven steps with
real, run-for-real output.

## Choose your integration

Tests are where most people start. This is where you go next:

| You want | Start with |
|---|---|
| Traces in tests, least wiring | `@narrativetrace/vitest` (`createNarrativeTest`) |
| To choose exactly what is wrapped, in plain TypeScript/JavaScript | `@narrativetrace/proxy` (`traceObject`) directly |
| Per-request tracing in an Express app | `@narrativetrace/express` |
| Per-request tracing in Hono (edge/serverless) | `@narrativetrace/hono` |
| Zero-application-code Nest provider tracing | `@narrativetrace/nestjs` (`AutoProxyModule`) |
| Angular service/DI tracing + HTTP correlation | `@narrativetrace/angular` |
| React component/service tracing | `@narrativetrace/react` (+ `@narrativetrace/react-router` for navigation) |
| Browser page with a bundler | `@narrativetrace/core-web` + `@narrativetrace/browser` |
| Browser page, no bundler, classic `<script>` | `@narrativetrace/standalone` |
| Cross-request/async visibility on Node | `AsyncNarrativeContext` (`AsyncLocalStorage`-backed) |
| Traces in your production log stream | `@narrativetrace/winston` or `@narrativetrace/pino` |
| OpenTelemetry spans | `@narrativetrace/opentelemetry` |

There is no zero-code, "wrap an app you didn't write" path — no Java-agent equivalent. `Proxy` and
decorators need a call site or a class you can annotate; a `require`/ESM loader hook was deliberately
rejected as fragile across Node versions and bypassed entirely by bundlers and browsers. Full
decision diagram, caveats per path, and the reasoning behind the platform ceiling:
[Choosing an Integration](documentation/choosing-an-integration.md).

## Packages

All 21 packages:

| Package | You need it when... |
|---------|---------------------|
| `@narrativetrace/core` | Always required. Zero runtime dependencies; platform-agnostic. |
| `@narrativetrace/core-node` | Node runtime: `AsyncNarrativeContext` (AsyncLocalStorage), `NARRATIVETRACE_*` env config, shutdown auto-flush. |
| `@narrativetrace/core-web` | Browser runtime seam for the platform-agnostic core. |
| `@narrativetrace/proxy` | Using ES Proxy tracing (most common). |
| `@narrativetrace/vitest` | Auto-tracing in Vitest tests + per-test clarity/failure reporting. |
| `@narrativetrace/diagrams` | Generating Mermaid/PlantUML sequence diagrams. |
| `@narrativetrace/clarity` | Analyzing method/param naming quality; `clarity-results.json` gate. |
| `@narrativetrace/glossary` | Harvesting and rendering a domain glossary (ubiquitous language) from traces; feeds clarity's project vocabulary and translated trace views. |
| `@narrativetrace/browser` | Browser console rendering and network export. |
| `@narrativetrace/standalone` | One-file bundles (classic `<script>` global or ES module) for plain-JavaScript pages without a bundler. |
| `@narrativetrace/angular` | Angular integration: `provideNarrativeTrace()`, interceptor, DI tracing. |
| `@narrativetrace/react` | React hooks/provider for capturing component + service traces. |
| `@narrativetrace/react-router` | React Router navigation capture. |
| `@narrativetrace/express` | Express middleware: per-request context, fail-safe extractors, `onRequestComplete`. |
| `@narrativetrace/hono` | Hono middleware (edge/serverless), `finally`-completion parity. |
| `@narrativetrace/nestjs` | NestJS `AutoProxyModule.forRoot({ pipeline, consumers, onRequestComplete })`. |
| `@narrativetrace/observability` | Log-scope enricher (`code.*`, `trace_id`, `service.*`, `nt.depth`) + request middleware. |
| `@narrativetrace/opentelemetry` | OTel bridge: live `createOtelEventConsumer` + batch `TraceSpanExporter`. |
| `@narrativetrace/winston` | Winston consumer with typed fields + configurable per-event levels. |
| `@narrativetrace/pino` | Pino consumer with typed fields + configurable per-event levels. |

**Typical starting point:** `core-node`/`core-web` + `proxy` + `vitest`.

## Concurrency support

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

The Markdown renderer surfaces the concurrency structure and where time actually went:

```
- ⑂ fork [2 tasks]
  - ↦ `InventoryService.check("P1")` → `true` — 40ms
  - ↦ `PricingService.quote("P1")` → `"12.50"` — 110ms
- ⑃ join — 110ms (waited 70ms for PricingService after InventoryService)
```

Work propagated by a context snapshot rather than a group joins the launching trace the other way
round: it is reported from the moment it publishes a call, not only once its scope closes, and its
first span is tagged `concurrency.kind === "async"`. Helpers that publish their own children opt out
with `snapshot.activateWithoutAdoption(...)`. See the
[framework guide](documentation/framework-integration-guide.md#contextsnapshot-cross-boundary-propagation).

Un-awaited overlapping calls on a shared browser `SyncNarrativeContext` are unsafe — use an explicit
fork/fire-and-forget per task (see the [framework guide](documentation/framework-integration-guide.md)).

## Privacy and safety

This library runs inside your process and writes files your team will share. What that means, on
one screen:

| Guarantee | How it holds |
|---|---|
| **Every shipped integration honors redaction** | `traceObject()` is the one capture path every integration (`express`, `hono`, `nestjs`, `angular`, `react`, `vitest`, …) is built on, and none of them expose a way to reach `RedactionPolicy.DISABLED`. `@notTraced`/`static notTraced` always win — even under a renderer an application explicitly built with redaction turned off. |
| **Redaction survives nesting and templates** | A redacted member stays redacted inside an array, `Set`, `Map`, plain object, several stacked, or a self-referential cycle; a `{param.property}` narration template naming a redacted member resolves to `[REDACTED]`, never the value. |
| **Tracing failures cannot fail your application** | Capture is best-effort by construction — a throwing custom `toString()`, a throwing getter named in a template, or a full buffer degrades to an untraced call, never blocks or fails the business method. |
| **Resource use is bounded** | The buffered analysis path is a fixed-size ring (8,192 events by default in tests, 65,536 in a long-lived process) that sheds rather than blocks — and says so: a capture that lost events prints the count and what to raise in its own footer. |

Two honest limits. First, the only way values escape redaction is application code that calls the
low-level renderer directly with `RedactionPolicy.DISABLED` — a deliberate, reviewable act in your
own source, and even then the `@notTraced`/`static notTraced` annotations still redact. Second,
capture invokes a small fixed set of your code while rendering — a custom `toString()`, a
`@narrativeSummary` method, and property paths named in `@narrated`/`@onError` templates — so keep
those pure, as you would for a debugger. There is also no zero-code, "wrap an app you didn't write"
path, and this runtime has not shipped a value-free structural artifact (some other NarrativeTrace runtimes
have) — see the two pages below for the precise, row-by-row versions of both.

→ [Privacy and Redaction](documentation/privacy-and-redaction.md) for the row-by-row contract verified
against the code, and [What to Commit](documentation/what-to-commit.md) for which generated files to
keep out of version control. When another library also wraps the same methods (a DI container,
another `Proxy`, a contract library), NarrativeTrace narrates business-boundary crossings only, and
which wrapper sits "outer" never changes the result or exception that reaches the narrative — see
the FAQ below for the full coexistence contract.

## Performance

Tracing does work and work costs something — we will not claim "zero overhead." The proxy
intercepts calls via ES `Proxy`, captures parameters, renders values to strings, and builds the
trace tree. When tracing is disabled, the wrap is zero-work by construction: wrapping
`NOOP_CONTEXT` returns the **original object itself** (no proxy, no per-call cost at all), and a
live context at `level: 'off'` keeps the proxy (the level can flip at runtime) but a call does no
capture work — one cached-wrapper lookup and one `isActive` check, no allocation, no rendering.

Measured (2026-09-07, Node 22, this repo's Linux dev container, `packages/benchmarks`
`proxy.bench.ts`): a trivial two-argument method ran at ~9.8M ops/s raw; the same call through a
wrapper at `level: 'off'` ran at ~4.3M ops/s — on the order of 0.1 µs added per call; the
`NOOP_CONTEXT` wrap was indistinguishable from the raw object, because it *is* the raw object.
With tracing fully on (`detail`: parameter + return-value rendering), the same trivial call ran at
~105K ops/s (~10 µs per call) — the cost of actually rendering the story.

The `packages/benchmarks/` directory contains Vitest benchmarks for context enter/exit, proxy
overhead, value rendering, and Markdown/JSON rendering at multiple tree sizes, with saved baselines
under `reports/benchmarks/` so a regression stays visible across commits. Run `pnpm run bench` (or
`pnpm run bench:save` to compare against the saved baseline) to reproduce the numbers above on your
hardware — we report these as measurements you should reproduce, not headline figures, because
container and machine load move them run to run.

For extremely hot loops, use `level: 'off'` or narrow the traced scope to the boundary that matters.

## What is free and what is Pro

**Free** is everything in this repository — source-available under BSL 1.1, free in production,
converting to Apache 2.0 four years after each release: the whole runtime, per-test traces in every
format (Markdown, JSON, canonical JSON, Mermaid, PlantUML), clarity scoring and the domain glossary,
and every integration in the tables above.

**Pro** is intelligence *across* runs: event-stream aggregation (`@narrativetrace/pro-aggregate`,
hotspots, error paths/rates, method/error frequencies) and an MCP server connecting Claude Code /
Cursor directly to your traces are in development; flow summaries, migration diffs, dependency-graph
diagrams, and an audit & compliance suite are planned. Not all of it ships today — the
[Feature Guide](documentation/feature-guide.md) is the authoritative status table: it labels every
feature Free, Pro, In development, or Planned, and cites the code behind each shipped row.

## Documentation

Start here:

- [First 10 Minutes](documentation/first-10-minutes.md) — one tiny service, one Vitest test, seven steps to a real trace, with real output
- [Installation Guide](documentation/installation-guide.md) — dependencies, every integration path, trace output setup
- [Choosing an Integration](documentation/choosing-an-integration.md) — which package you need, as a decision diagram
- [Configuration Guide](documentation/configuration-guide.md) — tracing levels, Vitest config, render options
- [Decorators Guide](documentation/decorators-guide.md) — `@traced`, `@narrated`, `@onError`, `@notTraced`

Going deeper:

- [Privacy and Redaction](documentation/privacy-and-redaction.md) — the row-by-row redaction contract, verified against the code
- [What to Commit](documentation/what-to-commit.md) — which generated files are run output and which (if any) are reviewed baselines
- [Troubleshooting](documentation/troubleshooting.md) — symptom → cause → fix for the failure modes people actually hit
- [Clarity Guide](documentation/clarity-guide.md) — scoring model, NLP components, static scanner
- [Framework Integration Guide](documentation/framework-integration-guide.md) — Express, Hono, browser, AsyncLocalStorage
- [Examples Guide](documentation/examples-guide.md) — the `pnpm demo` launcher and the runnable examples: ecommerce, clarity, Minecraft, plain JavaScript, Express, Hono, distributed (Docker + Jaeger), browser
- [Feature Guide](documentation/feature-guide.md) — canonical catalog of what this runtime ships, with tier and status

## Building from source

```bash
pnpm install                                      # install dependencies
pnpm run check                                    # lint + metrics + coverage + mutation testing
pnpm run build                                    # build all packages
pnpm run test                                     # run all tests
```

## Verify everything

`pnpm run check` is the per-commit gate; `pnpm run verify:all` runs *every* verification this repository has, gate and heavy alike — unit tests, coverage, mutation testing, property and fuzz tests, benchmarks, architecture rules, both stress tiers, canonical-schema conformance, and the secrets/SAST/SCA scanners — in one sitting, and writes a dated report.

```bash
pnpm run verify:all                               # long-running by design — see below
```

It is **long-running by design**: mutation testing across the whole workspace is the slowest category (tens of minutes on a modest container). A category's failure never aborts the run — every category gets its turn, and the command only exits non-zero at the end. Read the result at `reports/verification/<date>.json` (one row per category: tool, status, metrics, duration) and the `reports/verification/<date>.md` table rendered straight from it.

## FAQ

### How much overhead does this add, and what happens under high concurrency?

We do not claim "zero overhead" — see [Performance](#performance) above for the dated numbers this answer summarizes (2026-09-07, Node 22, this repo's container): with tracing on but `level: 'off'`, a call costs on the order of **0.1 µs** more than the untraced call; at full detail (parameters and return values rendered), it costs **~10 µs**. What NarrativeTrace itself adds is capture — intercepting the call, reading arguments, building the trace tree. Everything after capture (the write to disk, the collector, the network hop) is the same cost your existing logging sink already pays; NarrativeTrace does not add a second sink. For a team replacing hand-written `console.log`/`logger.debug` calls, the sink side is close to a wash: N log writes per method become one trace write, and the log statements themselves stop being written, reviewed, and kept in sync with the code.

Under concurrency, the two paths of the default `DualPathPipeline` have different guarantees. A synchronous listener, if you attach one (piping events to winston/pino, for example), runs inline on the caller's own execution, so it is exactly as durable — and costs exactly what — your existing logger call already does. The buffered analysis path, the one that feeds `captureTrace()`, is a fixed-size ring (default 65,536 events, sized per context — see [Event Pipeline Buffering](documentation/configuration-guide.md#8-event-pipeline-buffering-bufferedeventconsumer)) drained off a timer. It never blocks the caller: at capacity it overwrites the oldest undrained event and **counts** it in `overflowCount()` rather than dropping it silently, so sustained overload under load is visible rather than guessed at.

**The honest gap:** there is no sampling in this runtime, or any NarrativeTrace runtime, today — every traced call is captured in full at its configured level. A percentage- or rate-based sampler is on the roadmap, not shipped. If you need to cap capture volume today, narrow the traced scope to the boundary that matters or drop the hot path to `level: 'off'`/`'errors'`.

### How do I know a parameter with PII or credentials won't leak into a trace?

Four independent layers, not one blanket promise — see [Privacy and Redaction](documentation/privacy-and-redaction.md) for the row-by-row contract verified against the code:

1. **`@notTraced(i)` on a parameter / `static notTraced = [...]` on a class** — explicit redaction you control, by index or by field name. This always wins, even if something else in your stack calls the low-level renderer with redaction turned off.
2. **An always-on, multilingual name deny-list** — every capture path matches field and parameter names against patterns like `password`, `secret`, `token`, `ssn`, `cvv`, `apikey`, `cardNumber`, `passphrase`, `bearer`, `taxId`, plus Spanish (`contraseña`, `tarjeta`, `dni`, `rut`…), Portuguese (`senha`, `cpf`, `cnpj`), French (`motDePasse`, `carteBancaire`, `nir`), German (`passwort`, `kennwort`) and Chinese (`密码`, `身份证`) equivalents. It is on by default, not opt-in, and the patterns most prone to false positives match on identifier-token boundaries — `panelId` and `circuitBreaker` are not caught by `pan`/`cuit`.
3. **Value-shape matching, independent of the field name** — a JWT-shaped string, a Luhn-valid card number, a `Set-Cookie`-shaped value, or a national-ID checksum or structural rule (Chilean RUT, Brazilian CPF/CNPJ, Spanish DNI/NIE, French NIR, Chinese resident ID, or a dashed US Social Security number — the one exception with no checksum, so the SSA's own never-issued area/group/serial ranges stand in for one) is redacted even when it arrives under an innocuous name like `data` or `value`.
4. **No structural, value-free mode yet in this runtime.** Some NarrativeTrace runtimes ship a `.nt`-style artifact carrying the call graph and shapes but zero runtime values — the categorical guarantee for a context where no value may ever leave the process, such as handing a trace to an external AI tool. TypeScript has not built that yet ([why](documentation/what-to-commit.md#why-there-is-no-approvednt-row-here-yet)); until it does, treat every artifact this runtime generates as carrying real values, protected by the three layers above rather than by construction.

Be precise about the boundary: name and shape matching are heuristic and extensible — patterns get added as gaps are found, and can always miss one nobody has named yet. They are not the categorical guarantee the value-free mode is. If your threat model requires "no value can possibly leave the process," that requirement is not met by this runtime today.

### Can trace IDs correlate with a standard correlation ID across services, or is tracing local only?

They can, through the mechanism OpenTelemetry itself uses: W3C [`traceparent`](https://www.w3.org/TR/trace-context/). `parseTraceparent()` reads an inbound header and continues the upstream trace id; `formatTraceparent()` (core) and the browser/Angular integrations' `tracedFetch()`/`traceInterceptor` stamp it on outbound requests. The trace id NarrativeTrace generates is W3C-shaped from the start (32 lowercase hex characters), so it is the same id your OTel collector or correlation-id middleware already understands — there is nothing separate to reconcile. The [`opentelemetry`](documentation/feature-guide.md) integration additionally exports NarrativeTrace spans with typed `narrative.param.*` attributes, and the distributed-tracing example in [Examples Guide](documentation/examples-guide.md) runs several services sharing one `traceId` end to end.

What stays local: the narrative tree itself — the nested method calls, arguments, narration — is captured per process and is not shipped to other services; only the trace id is. A downstream service produces its own narrative tree correlated to that same id, not a single merged cross-service tree.

### How does value serialization work?

NarrativeTrace uses **eager serialization** — parameter values and return values are rendered to strings at the moment of capture, before they're stored in the trace. This is a deliberate design choice:

- **Correctness:** Objects are captured as they were at call time. If a mutable object is modified after the traced call returns, the trace still shows the original value.
- **No object retention:** The trace holds only strings, not references to your domain objects. Nothing prevents your objects from being garbage collected.
- **Safe rendering:** The built-in `renderValue()` handles: null, undefined, strings, numbers, booleans, arrays, plain objects, BigInt, symbols, functions, and circular references. Large values are truncated (`maxStringLength`, `maxArrayItems`, `maxObjectKeys`).

### Can tracing trigger side effects in my code?

Only in a small, documented set of places. Introspection enumerates own enumerable properties (`Object.keys`) — a class getter lives on the prototype and never runs. The members NarrativeTrace *does* invoke are: a custom `toString()`, a `@narrativeSummary` method, and property paths named in `@narrated`/`@onError` templates. Keep those pure, as you would for a debugger or serializer — or list the field in `static notTraced`, in which case its value is never read at all. Every invocation is bounded and exception-isolated (a throwing getter can never fail your business call), thenables are never awaited, and with tracing off no rendering happens whatsoever. See the purity contract in the [decorators guide](documentation/decorators-guide.md).

### Does it trace private methods?

No — the ES Proxy traces public methods on the object. But private methods are visible through the service calls they make:

```ts
private fulfillOrder(order: Order) {
  if (order.isDigital) {
    this.deliveryService.sendDownloadLink(order.customerId, order.productId);
  } else {
    this.warehouseService.shipPhysical(order.customerId, order.shippingAddress);
  }
  this.notificationService.confirmOrder(order.customerId, order.orderId);
}
```

The trace shows which branch ran:

```
OrderService.placeOrder(customerId: "C1", productId: "SKU-EBOOK")
  DeliveryService.sendDownloadLink(customerId: "C1", productId: "SKU-EBOOK") -> "https://..."
  NotificationService.confirmOrder(customerId: "C1", orderId: "ORD-001") -> true
```

No need to trace the `if` — the presence of `sendDownloadLink` and absence of `shipPhysical` tells the story. ES `#private` fields cannot be intercepted by Proxy (JavaScript language limitation), but the architectural benefit is the same.

### Why don't self-calls nest?

Traced methods run with `this` bound to the raw target, not the proxy (`Reflect.apply(fn, target, args)` inside the method wrapper). A method calling a sibling on the same object (`this.validate(order)`) therefore invokes the raw method — the call runs correctly, but it is not captured, so self-calls never appear as nested spans. This is a deliberate design trade, not a gap: binding the raw target makes the proxy immune to the classic Proxy landmines — `#private` fields (which throw through a proxy receiver), built-ins with internal slots (`Map`, `Date`), and arrow-function fields.

Nesting comes from wrapping collaborators, and that is the one structural rule: **decompose into collaborator services, wrap each where it is constructed.** A composition root that wraps `OrderService`, `InventoryService`, and `PaymentService` once each gets the full nested narrative — which is also the code shape that reads best, traced or not.

### How does NarrativeTrace interact with other libraries that wrap methods (AOP, proxies, contract libraries)?

NarrativeTrace narrates business-boundary crossings, not machinery. Its own attachment mechanisms
are opt-in and deliberately narrow: `traceObject()` wraps one object at a time in an ES `Proxy`
implementing only the `get` trap, so every other operation — property enumeration, `instanceof`,
prototype access — passes through untouched to whatever else is wrapping the same object. A
built-in exclusion list keeps coercion/inspection hooks (`toString`, `valueOf`,
`Symbol.toPrimitive`) from being narrated as business calls, and this exclusion is intended to grow
as gaps are found, never shrink.

When another library also wraps the same methods — a contract library, an AOP proxy, a DI container
interceptor — which one ends up "outer" changes only the cosmetic nesting of trace frames, never
which facts make it into the narrative or what the business result ends up being: a thrown exception
or a returned value always passes through every layer unmodified. Violation capture is designed to
be order-independent in principle — a fact should enter the narrative as an event emitted at its own
source, not inferred by watching for it to propagate through a wrapper — though NarrativeTrace does
not yet expose a public API for a third-party library to feed such a fact into an in-progress trace;
that is tracked as future work rather than promised today.

The levers available now to keep a third party's synthetic or generated methods out of your traces
are `@notTraced`/`static notTraced` on classes you control, and simply not calling `traceObject()`
on a surface you don't want narrated — there is no repo-wide default-ignore list yet for excluding
another library's generated classes by name pattern.

## License

NarrativeTrace's API and output format are open standards (Apache 2.0). Its runtime is free and
source-available (BSL 1.1, converting to Apache 2.0 four years after each release). Pro is
commercial.

What that means for the packages in this repository:

| Part | License |
|---|---|
| The runtime — every `@narrativetrace/*` package published from this repository | [BSL 1.1](LICENSE) (SPDX `BUSL-1.1`), converting to Apache 2.0 four years after each release |
| The annotation/decorator API, the output-format spec and the clarity rubric | [Apache 2.0](LICENSE-APACHE) (api split pending — see below) |
| Documentation prose | [CC BY 4.0](https://creativecommons.org/licenses/by/4.0/) |

The Additional Use Grant permits production use for any purpose, including in products and services
you provide to your own customers; the one exclusion is offering NarrativeTrace itself — or a
product or service whose value derives substantially from it — to third parties as a logging,
tracing or code-narrative product or service. See [LICENSE](LICENSE) for the exact terms, or
contact <hello@narrativetrace.ai> about alternative arrangements.

<!-- legal:trademark:begin -->
NarrativeTrace is a trademark of Empower Agile. The license grants no trademark rights.
<!-- legal:trademark:end -->

### The licence, in plain words

Everything in this repository ships under Business Source License 1.1 today — the Apache-licensed
pieces (the annotation/decorator API, the output-format spec, the clarity rubric) are not yet split
into a package of their own.

<!-- legal:plain-words:begin -->
**Free to run.** The runtime is source-available under the Business Source
License 1.1: read it, audit it, patch it, and use it in production at no cost —
including inside the products and services you sell to your own customers.

**One exclusion.** You may not offer NarrativeTrace itself — or a product or
service whose value derives substantially from it — to third parties as a
logging, tracing or code-narrative product or service.

**It opens on a date.** Every release converts to Apache 2.0 four years after it
is published; the exact date is printed in that release's LICENSE.

*This summary is a courtesy, not a licence. The LICENSE file is the only binding
text; where the two differ, the LICENSE governs.*
<!-- legal:plain-words:end -->
