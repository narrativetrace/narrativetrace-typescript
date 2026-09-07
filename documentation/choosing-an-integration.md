# Choosing an integration

NarrativeTrace has one capture model — an enter/exit event, built by
`traceObject()`'s ES `Proxy`, published to a `NarrativeContext` — reached by
several different attachment points. This page answers "which package do I
actually need," first as a lookup table, then as a decision diagram, then
with the caveats each path has.

## You want... / Start with...

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
| Cross-request/async visibility on Node | `AsyncNarrativeContext` (`@narrativetrace/core-node`, `AsyncLocalStorage`-backed) |
| Parallel work under one trace | `ForkJoinGroup` / `FireAndForgetGroup` (`@narrativetrace/core`) |
| Traces in your production log stream | `@narrativetrace/winston` or `@narrativetrace/pino` |
| OpenTelemetry spans | `@narrativetrace/opentelemetry` |

This is the same matrix the [root README](../README.md#choose-your-integration)
carries; it lives here too as the anchor for the diagram and detail below.

## The decision

```text
Where does the call happen?

Vitest test
   |
   +--> @narrativetrace/vitest (createNarrativeTest)

Plain TypeScript/JavaScript — you construct the object yourself
   |
   +--> @narrativetrace/proxy (traceObject) directly

Express / Hono request handler
   |
   +--> the matching middleware package, one AsyncNarrativeContext per request

NestJS provider graph
   |
   +--> @narrativetrace/nestjs — no call sites touched, DI wraps every provider

Angular / React component tree
   |
   +--> @narrativetrace/angular or @narrativetrace/react

Browser page with no framework
   |
   +-- has a bundler --> @narrativetrace/core-web + @narrativetrace/browser
   +-- no bundler     --> @narrativetrace/standalone (classic <script>)
```

Every branch ends at the same `traceObject()`/`Proxy` mechanism — a
middleware or DI module is a wrapper that decides *when* to call it and
*which* `NarrativeContext` to hand it, never a second capture path. This is
deliberate, not an oversight: a `require`/ESM loader hook was rejected
because JS retains no parameter names at runtime (annotations already carry
that weight) and loader instrumentation is bypassed entirely by bundlers,
browsers, and edge runtimes, where `Proxy` is standard.

## One thing every path shares

All of the packages above publish through the same `NarrativeContext` /
`DualPathPipeline` (`@narrativetrace/core`); none of them define their own
notion of a captured call. Choosing an integration is a question of *how the
call gets wrapped and which context receives it*, never of what gets
recorded once it is.

## Caveats per path

- **`traceObject` (proxy)** — wraps one object at a time; there is no
  interface requirement (unlike a JVM dynamic proxy) because the `Proxy`
  wraps the concrete object directly. Every method reachable through
  property lookup — own or inherited from the prototype chain — is
  wrapped; a call made directly on the un-wrapped instance bypasses tracing
  entirely, and
  `#private` fields cannot be intercepted by `Proxy` at all — a JavaScript
  language limitation, not a bug.
- **Express / Hono** — one `AsyncNarrativeContext.run()` per request is what
  keeps concurrent requests from bleeding into each other's traces; skipping
  that and sharing one context across requests is a correctness bug, not a
  convenience.
- **NestJS** — `AutoProxyModule.forRoot(...)` wraps every provider it is
  given; there is no per-method opt-out from inside the module today —
  narrow what you hand it, or add `@notTraced` on the methods you don't want
  values captured for.
- **Cross-thread work** — Node has no threads to cross, but async work still
  needs explicit propagation: `AsyncNarrativeContext` follows an `await`
  automatically, but a task launched and *not* awaited (a timer, a fire-and-
  forget promise, a Worker) does not inherit the active span on its own.
  Use `ForkJoinGroup`/`FireAndForgetGroup` for tasks you own, or
  `context.snapshot()` + `snapshot.wrap(...)` to graft detached work into
  the parent trace by hand.
- **Browser** — `SyncNarrativeContext` has no implicit propagation at all
  (no `AsyncLocalStorage` in a browser); overlapping un-awaited calls on a
  shared context corrupt each other. Use an explicit fork/fire-and-forget
  group per concurrent task, same as the async-work caveat above.

## Platform ceilings

There is no zero-code, "wrap an app you cannot modify" path on this
platform — no Java-agent equivalent, and none planned. `TC39` decorators and
`traceObject()` need a call site or a class you can annotate; a
`require`/ESM loader hook was deliberately rejected (fragile across Node
versions, and bypassed entirely by bundlers, browsers and edge runtimes,
where `Proxy` is standard).

## Recipes

Every path in the matrix has a complete, copy-pasteable recipe in the
[Installation Guide](installation-guide.md) — this page answers *which*,
that one answers *how*.
