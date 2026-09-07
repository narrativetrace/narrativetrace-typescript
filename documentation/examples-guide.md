# Examples Guide

NarrativeTrace ships with 12 runnable examples under `examples/`. Each is an independent package with its own tests. Four of them — ecommerce, clarity, minecraft (both halves) and plain-js — are also reachable through the `pnpm demo` launcher described [below](#demo-launcher).

## Quick reference

| Example | What it demonstrates | Run command |
|---|---|---|
| [ecommerce](#ecommerce) | The flagship: six scenarios over a traced service graph — success, failures, a flaky decorator, fork/join | `pnpm run example:ecommerce` |
| [clarity](#clarity) | What the clarity analyzer rewards and penalizes: a hotel domain at four naming tiers plus the report | `pnpm run example:clarity` |
| [express](#express) | Express middleware + HTTP trace context | `pnpm run example:express` |
| [hono](#hono) | Hono middleware + HTTP trace context | `pnpm run example:hono` |
| [distributed](#distributed) | 5 microservices + Jaeger + OTel correlation | `pnpm run example:distributed` |
| [minecraft](#minecraft) | Domain-driven naming, trace readability | `pnpm run example:minecraft` |
| [minecraft-generic](#minecraft-generic) | Generic naming, trace comparison | `pnpm run example:minecraft-generic` |
| [plain-js](#plain-js) | The API from plain JavaScript: `.mjs`, JSDoc types, no decorators | `pnpm run example:plain-js` |
| [script-tag](#script-tag) | Browser page with classic `<script>` tags: `window.NarrativeTrace` from one bundled file, no bundler | `pnpm run example:script-tag` |
| [browser](#browser) | Vite page: trace rendered in-page, DevTools console, POST to collector | `pnpm run example:browser` |
| [express-angular](#angular--express) | Full-stack: Angular frontend + Express backend | `pnpm run example:express-angular` |
| [nestjs-react](#nestjs--react) | Full-stack: NestJS zero-code DI tracing + React frontend | `pnpm --filter @narrativetrace/example-nestjs-react start` |

## Demo launcher

`pnpm demo` is the fastest way to watch the examples: one command, the live narration colorized
and indented by call depth, and every rendering announced as its own section. It opens an
interactive picker; `--example <name>` runs non-interactively; `--list` enumerates the examples.
Build once first (`pnpm run build`) — the examples import the packages' `dist`.

```bash
pnpm demo                                     # picker: ecommerce, clarity, minecraft, plain-js
pnpm demo -- --example ecommerce              # non-interactive
pnpm demo -- --example ecommerce --classic    # timestamped logs through the winston bridge
pnpm demo -- --example ecommerce --no-pause   # play straight through, no stop points
pnpm demo -- --example ecommerce --lang es    # re-render the run through examples/ecommerce/glossary.json
pnpm demo -- --list
```

**It walks, it does not scroll.** On a terminal the demo stops after every scenario — `[Enter]`
moves on, `q` quits — and each scenario opens with a note on *how that scenario's trace is
configured*: `@traced`/`@narrated`/`@onError`/`@notTraced` here, a bare `traceObject` with a
`paramNames` map there, `ForkJoinGroup` for the concurrent one. The notes live beside the code in
each example's `src/scenarios.ts` (`Scenario { title, wiring, run }`), and the root test
`tools/__tests__/demo-wiring.test.ts` fails if a scenario ever loses its note or the registry and
`--list` disagree. Paced runs are recorded first and then walked, so a stop point can never inflate
the durations the trace tree reports; `--no-pause` plays the run straight through, live, and is
what pipes and CI get. `NO_COLOR` drops the colors, `FORCE_COLOR` keeps them in a pipe.

**Where the renderings come from** is answered once per run, at the first rendering section.
There is no default renderer and nothing to configure: capture produces a `TraceTree` and you call
the renderer you want — `renderIndentedText(tree)`, `renderProse`, `renderMermaidSequence`,
`renderPlantUmlSequence`. The live `→ ← !!` lines are not a renderer at all: that is an
`EventConsumer` on the inline path of the example's `DualPathPipeline` (`tools/demo-stream.ts`, the
twin of Java's `Slf4jTraceEventListener`) — the only view that costs no rendering code.
Configuration selects a renderer in exactly one place, trace files written from tests:
`NARRATIVETRACE_OUTPUT=true` plus `NARRATIVETRACE_FORMAT=md|mmd|json|puml`.

**Classic log output is a first-class mode.** `--classic` sends the same run through
`@narrativetrace/winston` with a traditional `yyyy-MM-dd HH:mm:ss.SSS LEVEL [thread] [logger] -
message` format — the point being that the narration is ordinary log lines every log tool ingests.

**Translated traces are a first-class mode too.** Every launcher example commits a domain glossary
(`examples/<name>/glossary.json` — one bounded context with curated Spanish and Simplified Chinese
terms), and `--lang es` (or `zh-CN`) re-renders the same run through it: identifiers appear in the
chosen language with the original kept in brackets (`buscar cliente [findCustomer]`), while
parameter values, return values and error messages stay byte-identical. The picker offers exactly
the locales the glossary *and* the library's scaffolding bundle carry. Untranslated phrases collect
into a "glossary gaps" footer — the curation work queue — and the poorly named scenarios
(minecraft's unrefactored half, clarity's legacy processing) stay untranslated on purpose: names
that tell no story cannot be translated into one. `@narrated`/`@onError` templates are in the
glossaries but not yet translated (the export schema does not carry the template yet).

Launcher code: `tools/demo.ts` (terminal binding), `tools/demo-runner.ts` (orchestration, tested
against a fake terminal), `tools/demo-args.ts`, `tools/demo-colors.ts`, `tools/demo-stream.ts`,
`tools/demo-registry.ts`, `tools/demo-translate.ts`. Zero runtime dependencies beyond the
workspace; run from the repository root.

## Ecommerce

The flagship. Five in-memory services (customer, catalog, inventory, payment, notification) are
wrapped with `traceObject()`; the interesting orchestration is `DefaultOrderService`. Parameter
names come from `@traced`, the narration on `placeOrder` from `@narrated`, the bracketed failure
text from `@onError`, and the card token prints as `[REDACTED]` from `@notTraced(2)`.
`src/scenarios.ts` runs Java's six scenarios, each printing `--- Trace tree ---`, `--- Prose ---`
and `--- Mermaid ---` (or PlantUML):

1. **Successful order + async notification** — the happy path; the awaited notification lands in
   the same trace because `AsyncNarrativeContext` carries the span across `await`.
2. **Payment failure — inventory leak bug** — the trace shows `InventoryService.reserve` was called
   but `release` never was: traces surfacing a real bug.
3. **Flaky external service** — `FlakyNotificationService` decorating a stub succeeds once, then
   throws `ExternalServiceError`; wrapped with a bare `traceObject` at the call site.
4. **Unknown customer** — input-validation failure branch.
5. **Out of stock** — business-rule failure branch, additionally rendered as PlantUML.
6. **Explicit async capture** — `ForkJoinGroup.all` over two concurrent `RemoteCatalogService`
   lookups joined into one `⑂ fork` segment.

```bash
pnpm run example:ecommerce      # every scenario, sections only (the launcher adds the live stream)
pnpm demo -- --example ecommerce
```

**Key files:**
- `examples/ecommerce/src/scenarios.ts` — the scenario registry with the wiring notes
- `examples/ecommerce/src/scenario.ts` — `Scenario`/`ScenarioContext` and `createDemoContext(listener)`
- `examples/ecommerce/src/traced-services.ts` — `createTracedServices()` factory
- `examples/ecommerce/src/order-service.ts` — orchestrator that calls all other services
- `examples/ecommerce/glossary.json` — the bounded context `--lang` translates through

## Clarity

Java's `ClarityDemoExample`: a hotel-reservation domain at four naming-quality tiers, then the
clarity report over the four captured trees. Wiring is identical across the tiers — the variable
under test is naming, not configuration.

1. **Guest books a room** — excellent, domain-specific naming (`DefaultReservationService`).
2. **Booking via manager** — adequate but less expressive naming (`DefaultBookingManager`).
3. **Legacy data processing** — intentionally weak naming (`DefaultDataProcessor`).
4. **Guest repository operations** — a cohesion mismatch (lookup, report rendering and email in
   one repository).
5. **Clarity analysis report** — `analyzeClarity` over the captured trees, printed with
   `renderClarityReport` and `renderClaritySuiteReport`.

```bash
pnpm run example:clarity
pnpm demo -- --example clarity
```

**Key files:**
- `examples/clarity/src/scenarios.ts` — `createClarityScenarios()`; the report scenario reads the
  trees the first four captured
- `examples/clarity/src/reservation-service.ts` — the well-named tier

## Express

An Express HTTP server that wraps the ecommerce services with `narrativeTrace()` middleware. Each request gets its own trace context via `AsyncNarrativeContext`.

```bash
pnpm run example:express
```

Then open `http://localhost:3000` in a browser. Submit the order form — the JSON response includes both the order result and the full trace tree.

**Key files:**
- `examples/express/src/app.ts` — Express app with `narrativeTrace(ctx)` middleware

## Hono

Same as the Express example but using the Hono framework.

```bash
pnpm run example:hono
```

Open `http://localhost:3001`. Same order form, same trace in the response.

**Key files:**
- `examples/hono/src/app.ts` — Hono app with `narrativeTrace(ctx)` middleware

## Distributed

Five microservices running in Docker containers, connected via HTTP, with distributed trace correlation through OpenTelemetry and Jaeger.

**Architecture:**

```
Browser → Gateway (:3000) → Customer-Catalog (:3001)
                           → Inventory (:3002)
                           → Payment (:3003) → Fraud (:3004)
```

All services share the same `traceId` via W3C `traceparent` header propagation. Each service produces both NarrativeTrace method-level traces and OTel spans.

### Prerequisites

- Docker and Docker Compose

### Running

```bash
pnpm run example:distributed
```

This spins up 6 containers:

| Container | Purpose | Exposed port |
|---|---|---|
| jaeger | Trace collector + UI | `localhost:16686` |
| gateway | API gateway, orchestrates the order flow | `localhost:3000` |
| customer-catalog | Customer + product lookup | internal |
| inventory | Stock reservation | internal |
| payment | Payment processing, calls fraud | internal |
| fraud | Fraud evaluation | internal |

### Placing an order

Open `http://localhost:3000` in a browser. Submit the order form with a customer, product, and quantity.

The JSON response includes:
- `order` — the order result (totalCharged, transactionId)
- `trace` — the NarrativeTrace tree from the gateway's perspective

### Viewing traces in Jaeger

Open `http://localhost:16686`. Select a service from the dropdown (e.g., `api-gateway`) and click **Find Traces**. Click a trace to see the full distributed span tree across all 5 services.

**Try these scenarios:**
- **C1 + P1** — happy path, all services succeed
- **C3 + P1** — payment declined (Charlie is blacklisted), trace shows error propagation through payment → gateway
- **Any + P2 qty 999** — insufficient stock, inventory service rejects the reservation

### Stopping

```bash
docker compose -f examples/distributed/src/docker-compose.yml down
```

**Key files:**
- `examples/distributed/src/gateway-app.ts` — orchestrates calls to downstream services
- `examples/distributed/src/traced-service-factory.ts` — creates OTel-integrated trace contexts
- `examples/distributed/src/docker-compose.yml` — container definitions

## Minecraft

A Minecraft-inspired domain (world generator, player inventory, crafting table, creature spawner, world server) with descriptive, domain-driven names. The trace reads like documentation.

```bash
pnpm run example:minecraft
```

**Output:**
```
WorldServer.playerJoined(playerName: "Steve")
  WorldGenerator.generateChunk(x: 0, z: 0) -> {"x": 0, "z": 0, "biome": "plains", ...}
  PlayerInventory.addItem(item: {"name": "oak_log", ...}, quantity: 4) -> true
  CraftingTable.craft(recipe: {"name": "oak_planks", ...}) -> {"name": "oak_planks", ...}
  CreatureSpawner.spawnHostile(type: "zombie", x: 10, y: 64, z: 10) -> ...
-> "Steve joined the world in plains biome"
```

## Minecraft-Generic

The exact same logic as the minecraft example, but with generic, opaque names (GameManager, DataProcessor, StateManager, ThingFactory, EntityHandler). Compare the two traces side by side — the naming quality difference is immediately visible. This is the core argument for NarrativeTrace: if your trace is unreadable, your code needs renaming, not more log statements.

```bash
pnpm run example:minecraft-generic
pnpm demo -- --example minecraft     # both halves, refactored first, as Java's one example
```

Both halves are wired byte for byte the same way — `traceObject(impl, context, paramNames,
{ className })`, no decorators — so the `paramNames` map is what names the parameters.

## Plain-JS

The platform's analog of Java's Kotlin `library` example: a plain-JavaScript ESM consumer
(`.mjs`, JSDoc types checked by `tsc --checkJs`, no decorators, no TypeScript) tracing a small
book-lending domain (`CatalogService`, `MemberService`, `LendingService`) through `traceObject`
with `paramNames` maps. Two scenarios: a successful borrow (tree, prose, Mermaid) and a
`BookUnavailableError` failure.

```bash
pnpm run example:plain-js
pnpm demo -- --example plain-js
```

**Key files:**
- `examples/plain-js/src/scenarios.mjs` — the registry, `createTracedLendingService(context)`
- `examples/plain-js/src/lending-service.mjs` — takes an injectable clock so tests are reproducible

## Browser

A real browser page served by Vite. It uses `SyncNarrativeContext` (no `AsyncLocalStorage` in the browser) and `@narrativetrace/core-web` for the Web Crypto id generator. Clicking **Run traced calculation** wraps a `Calculator` with `traceObject()`, including a caught `divide(1, 0)` so a `✗` outcome is visible, and then:

- renders the trace into the page with `renderIndentedText`,
- mirrors it to the DevTools console with `renderToConsole`,
- POSTs it as JSON with `postToCollector` to `/traces`, a dev-only collector middleware in `vite.config.ts` that logs each received trace to the terminal. The page reports the outcome (accepted / rejected / unreachable).

```bash
pnpm run example:browser      # Vite dev server on http://localhost:5175
```

Tests run under jsdom with `core-web` (never `core-node`), so the suite exercises the browser platform path; `pnpm --filter @narrativetrace/example-browser build` type-checks and produces a production bundle with `vite build`.

**Key files:**
- `examples/browser/index.html` — the page; loads `src/app.ts`
- `examples/browser/src/app.ts` — entry: imports `@narrativetrace/core-web`, mounts the demo
- `examples/browser/src/demo.ts` — `mountDemo()`: tracing, in-page + console rendering, collector export
- `examples/browser/src/calculator.ts` — the traced class
- `examples/browser/vite.config.ts` — dev server + `/traces` collector middleware

## Script tag

The browser counterpart of [plain-js](#plain-js): plain JavaScript in a web page with **no TypeScript, no bundler, no ES modules**. `public/index.html` loads two classic scripts in order: `/narrativetrace.global.js` — the [`@narrativetrace/standalone`](../packages/standalone/README.md) bundle, which defines `window.NarrativeTrace` and registers the browser id generator — and `/app.js`, hand-written ES5-style JavaScript (constructor function + prototype methods; `traceObject` does not care how objects are built). Clicking **Run traced checkout** traces a `ShoppingCart`, including a caught `checkout("EXPIRED")` so a `✗` outcome is visible, then renders the trace into the page, mirrors it to the DevTools console and POSTs it to `/traces`.

A ~60-line `node:http` server (`src/server.ts`) serves the three files from an explicit route table (no directory walk) and answers `POST /traces` with 202 while logging `[collector] received trace (N bytes)`; any other method on `/traces` is 405, anything else 404.

```bash
pnpm run example:script-tag      # http://localhost:5176
```

Tests: the server against an ephemeral port (routes, content types, collector, 405/404, traversal), and `app.js` itself under jsdom — loaded the way a browser does (HTML body, then the two classic scripts) — asserting the four rendered trace lines and the accepted / rejected / unreachable collector statuses.

**Key files:**
- `examples/script-tag/public/index.html` — the page; explains itself in HTML comments
- `examples/script-tag/public/app.js` — the plain-JavaScript application
- `examples/script-tag/src/server.ts` — static routes + `/traces` collector; `src/entry.ts` starts it

## Angular + Express

Full-stack example: Angular frontend calling the Express ecommerce backend with end-to-end trace correlation.

Demonstrates all `@narrativetrace/angular` features:
- `provideNarrativeTrace()` — one-call setup with automatic `traceparent` headers
- `provideTraced(OrderService)` — zero-code service tracing via Angular DI
- `TraceCaptureService` — captures client-side trace after each order
- `traceInterceptor` — automatically adds W3C `traceparent` header to every `HttpClient` request

### Running

```bash
pnpm run example:express-angular
```

This starts the Express backend on `:3000` and the Vite dev server on `:4200`. Open `http://localhost:4200`.

Place an order and see:
- **Order result** — orderId, transactionId, totalCharged
- **Client trace** — Angular-side trace showing `OrderService.placeOrder` (via `provideTraced`)
- **Server trace** — Express-side trace showing CustomerService, CatalogService, InventoryService, PaymentService
- **Trace ID** — same 32-hex ID on both sides (traceparent correlation)

**Key files:**
- `examples/express-angular/client/app.config.ts` — `provideNarrativeTrace()` + `provideTraced(OrderService)` setup
- `examples/express-angular/client/order.service.ts` — `HttpClient` wrapper, auto-traced
- `examples/express-angular/client/order-form.component.ts` — form UI + trace display
- `examples/express-angular/server/app.ts` — Express backend with CORS + `narrativeTrace(ctx)` middleware

## NestJS + React

Full-stack example: a NestJS backend that traces its service graph with **zero application code** via Nest dependency injection, paired with a React frontend that traces client-side calls. Both sides return their trace tree so you can see the request end to end.

Demonstrates:
- `AutoProxyModule.forRoot(...)` — `@narrativetrace/nestjs` module that auto-proxies every provider (`OrdersService`, `InventoryService`, `PaymentService`) so their method calls are traced without touching the service bodies
- `NarrativeStorage` — injected into `OrdersController` to `captureTrace()` for the current request
- `@narrativetrace/react` on the client — `NarrativeTraceProvider`, `useTraced()` (wraps `OrderService`), `useTracedFetch()`, and `useTraceCapture()` for the client-side trace

### Running

The example has no root `example:` script; run it through the package's own `package.json` scripts with `pnpm --filter`:

```bash
# Start both the NestJS server and the Vite dev server together
pnpm --filter @narrativetrace/example-nestjs-react start

# ...or start them independently
pnpm --filter @narrativetrace/example-nestjs-react start:server   # NestJS on :3000
pnpm --filter @narrativetrace/example-nestjs-react start:client   # Vite dev server on :5173
```

The NestJS backend listens on `:3000` (override with `PORT`) and the Vite dev server on `:5173`, proxying `/orders` to the backend. Open `http://localhost:5173`.

Place an order and see:
- **Order result** — orderId (`ORD-*`), transactionId (`TXN-*`), totalCharged
- **Client trace** — React-side trace of `OrderService.placeOrder` (via `useTraced`)
- **Server trace** — NestJS-side trace of `OrdersService` → `InventoryService` / `PaymentService`, auto-proxied by DI

### Testing

```bash
pnpm --filter @narrativetrace/example-nestjs-react test
```

**Key files:**
- `examples/nestjs-react/server/app.module.ts` — `AutoProxyModule.forRoot(...)` wiring
- `examples/nestjs-react/server/orders.controller.ts` — captures the request trace via injected `NarrativeStorage`
- `examples/nestjs-react/server/orders.service.ts` — orchestrator (`InventoryService` + `PaymentService`)
- `examples/nestjs-react/client/order-form.tsx` — `useTraced` / `useTracedFetch` / `useTraceCapture` + trace display

## Running all examples

```bash
pnpm run example:all
```

Runs ecommerce, minecraft, minecraft-generic, clarity and plain-js sequentially, then starts express and hono in parallel. The distributed example requires Docker and runs separately. For the guided, paced tour use `pnpm demo` instead.

## Running tests

Each example has its own test suite:

```bash
cd examples/ecommerce && pnpm run test      # 51 tests (domain + tracing + the six scenarios)
cd examples/clarity && pnpm run test        # 8 tests (domain + the tiers and the report)
cd examples/express && pnpm run test         # 4 tests
cd examples/hono && pnpm run test            # 5 tests
cd examples/distributed && pnpm run test     # 40 tests
cd examples/minecraft && pnpm run test       # 22 tests (domain + tracing integration)
cd examples/minecraft-generic && pnpm run test  # 18 tests
cd examples/plain-js && pnpm run test        # 8 tests (JSDoc-typed .mjs)
cd examples/browser && pnpm run test         # 4 tests
cd examples/express-angular && pnpm run test # 16 tests (server + Angular components + services)
cd examples/nestjs-react && pnpm run test    # 13 tests (NestJS supertest + React components + services)

# Or run everything via turbo:
pnpm run test

# The launcher's own tests (parser, colorizer, stream, registry/wiring check, translation, runner)
pnpm run test:root
```
