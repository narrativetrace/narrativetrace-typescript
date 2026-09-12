# NarrativeTrace TypeScript Framework Integration Guide

This guide covers integrating NarrativeTrace into web applications and the browser, from Express/Hono middleware through browser rendering and cross-async context propagation.

## Packages

| Package | Purpose |
|---|---|
| `@narrativetrace/core` | `SyncNarrativeContext`, `AsyncNarrativeContext` — context and renderers |
| `@narrativetrace/proxy` | `traceObject()` — ES Proxy-based method interception |
| `@narrativetrace/browser` | `renderToConsole`, `postToCollector` — browser-specific output |
| `@narrativetrace/nestjs` | `AutoProxyModule`, `NoAutoProxy`, `NarrativeStorage` — NestJS auto-proxy module |
| `@narrativetrace/react` | `NarrativeTraceProvider`, `useTraced`, `useTraceCapture` — React hooks and provider |
| `@narrativetrace/react-router` | `useNavigationCapture` — per-navigation trace capture |
| `@narrativetrace/opentelemetry` | `createOtelEventConsumer`, `TraceSpanExporter` — OTel span bridge |
| `@narrativetrace/winston` | `createWinstonEventConsumer`, `createWinstonFormat` — Winston log bridge |
| `@narrativetrace/pino` | `createPinoEventConsumer`, `createPinoMixin` — Pino log bridge |

## 1. Express Middleware

Per-request tracing using `AsyncNarrativeContext` (wraps `AsyncLocalStorage`):

```ts
import express from "express";
import { AsyncNarrativeContext, NarrativeTraceConfig, renderIndentedText } from "@narrativetrace/core";
import { traceObject } from "@narrativetrace/proxy";

const config = new NarrativeTraceConfig();
const asyncContext = new AsyncNarrativeContext(config);

const app = express();

// Middleware: create an isolated trace context per request
app.use((req, res, next) => {
  asyncContext.run(() => {
    res.on("finish", () => {
      const tree = asyncContext.captureTrace();
      if (!tree.isEmpty) {
        console.log(renderIndentedText(tree));
      }
      // Every cleanup step is independently best-effort — a throwing export must not skip
      // reset. Without it, this request's spans stay in the shared pipeline for the life of the
      // process (the built-in `narrativeTrace()` middleware, §1 below its "How it works", does
      // this for you).
      asyncContext.reset();
    });
    next();
  });
});

// Route handler: trace service calls
app.get("/api/orders/:id", (req, res) => {
  const orderService = traceObject(new DefaultOrderService(/* deps */), asyncContext);
  const result = orderService.placeOrder(req.params.id, "P1", 2);
  res.json(result);
});

app.listen(3000);
```

### How it works

1. `AsyncNarrativeContext.run()` creates a new `SyncNarrativeContext` inside `AsyncLocalStorage` for each request
2. All traced calls within the request share the same isolated context
3. On response finish, the trace is captured, rendered, and the context is reset
4. Concurrent requests have completely isolated traces

### Custom trace export

Replace the `res.on("finish")` handler with your own exporter — capture, export and reset each
stay independent, so a failing exporter still resets:

```ts
app.use((req, res, next) => {
  asyncContext.run(() => {
    res.on("finish", () => {
      try {
        const tree = asyncContext.captureTrace();
        if (!tree.isEmpty) {
          // Export as JSON to your observability platform
          const json = exportJson(tree, {
            scenario: `${req.method} ${req.path}`,
          });
          sendToCollector(json);
        }
      } finally {
        asyncContext.reset();
      }
    });
    next();
  });
});
```

## 2. Hono Middleware

Same pattern as Express, using Hono's middleware API:

```ts
import { Hono } from "hono";
import { AsyncNarrativeContext, NarrativeTraceConfig, renderIndentedText } from "@narrativetrace/core";
import { traceObject } from "@narrativetrace/proxy";

const config = new NarrativeTraceConfig();
const asyncContext = new AsyncNarrativeContext(config);

const app = new Hono();

// Middleware: per-request trace context
app.use("*", async (c, next) => {
  await asyncContext.run(async () => {
    try {
      await next();
    } finally {
      const tree = asyncContext.captureTrace();
      if (!tree.isEmpty) {
        console.log(renderIndentedText(tree));
      }
      // Reset even if capture/export above throws — a request-scoped context left un-reset
      // leaks its spans into the shared pipeline for the life of the process.
      asyncContext.reset();
    }
  });
});

app.get("/api/orders/:id", (c) => {
  const orderService = traceObject(new DefaultOrderService(/* deps */), asyncContext);
  const result = orderService.placeOrder(c.req.param("id"), "P1", 2);
  return c.json(result);
});

export default app;
```

## 3. Browser

The `@narrativetrace/browser` package provides two output mechanisms for browser environments.
In the browser, import the core API from `@narrativetrace/core-web`: it re-exports
`@narrativetrace/core` and registers the Web Crypto id generator explicitly. Importing
`@narrativetrace/core` directly still works — it falls back to Web Crypto itself — but
`core-web` is the tested, documented path.

### Console rendering

Renders the trace tree using `console.group()` and `console.log()` for hierarchical DevTools output:

```ts
import { NarrativeTraceConfig, SyncNarrativeContext } from "@narrativetrace/core-web";
import { traceObject } from "@narrativetrace/proxy";
import { renderToConsole } from "@narrativetrace/browser";

const context = new SyncNarrativeContext(new NarrativeTraceConfig());
const traced = traceObject(orderService, context);

traced.placeOrder("C1", "P1", 2);
renderToConsole(context.captureTrace());
```

### Network export

POST the trace tree as JSON (the `exportJson` document) to a collector endpoint. The promise
resolves with the `Response` for any HTTP status and rejects only on network failure, so check
`response.ok`:

```ts
import { postToCollector } from "@narrativetrace/browser";

const tree = context.captureTrace();
const response = await postToCollector(tree, { scenario: "place order" }, "https://your-collector.example.com/traces");
if (!response.ok) console.warn(`collector rejected the trace: HTTP ${response.status}`);
```

A complete page that does all of the above — trace on click, render into the page, mirror to the
console, POST to a dev collector — is `examples/browser` (`pnpm run example:browser`).

### No bundler: plain `<script>` pages

The regular packages import each other by bare specifier (`"@narrativetrace/core"`), which a
browser cannot resolve on its own. For pages without a bundler use `@narrativetrace/standalone`:
one file with `core-web` + `proxy` + `browser` bundled in, as a classic script
(`dist/narrativetrace.global.js` → `window.NarrativeTrace`) or an ES module
(`dist/narrativetrace.js`). Runnable: `examples/script-tag` (`pnpm run example:script-tag`).

### Browser limitations

Core context, ES Proxy, and value rendering are pure JavaScript with zero Node dependencies. What differs in the browser:

| Feature | Browser | Node |
|---------|---------|------|
| Context | `SyncNarrativeContext` | `SyncNarrativeContext` or `AsyncNarrativeContext` |
| Async propagation | Manual via `snapshot()` | `AsyncLocalStorage` via `AsyncNarrativeContext` |
| Timing | `performance.now()` | `performance.now()` |
| File output | Not available | `writeTraceOutput()` |
| Console output | `renderToConsole()` | `renderIndentedText()` / `console.log()` |
| Id generator | `@narrativetrace/core-web` (Web Crypto) | `@narrativetrace/core-node` (`node:crypto`) |
| Network output | `postToCollector()` | Custom (fetch/axios) |

### Manual async propagation in browser

Without `AsyncLocalStorage`, propagate context manually:

```ts
const snapshot = context.snapshot();
const worker = new SyncNarrativeContext(config);

// Wrap async callbacks
someAsyncApi.onComplete(() => {
  snapshot.wrapFn(worker, () => {
    // Traced calls here join the snapshotting context's trace, and are reported by its
    // captureTrace() from the moment they are published — not only once the callback returns.
    tracedService.processResult();
  });
});
```

## 4. AsyncNarrativeContext

`AsyncNarrativeContext` wraps Node's `AsyncLocalStorage` to provide per-request trace isolation:

```ts
import { AsyncNarrativeContext, NarrativeTraceConfig } from "@narrativetrace/core";

const config = new NarrativeTraceConfig();
const asyncContext = new AsyncNarrativeContext(config);

// Each run() creates an isolated SyncNarrativeContext
asyncContext.run(() => {
  // All trace calls here are isolated
  tracedService.placeOrder("C1", "P1", 2);
  const tree = asyncContext.captureTrace(); // only this run's events
});
```

### How it works

- `run(fn)` — creates a new `SyncNarrativeContext` inside `AsyncLocalStorage` and executes `fn`
- All `enterMethod`/`exitMethodWithReturn`/`exitMethodWithException` calls delegate to the current store
- `captureTrace()` returns only the current store's trace tree
- If called outside a `run()`, delegates to a default context

### Concurrent request isolation

```ts
// Request 1 and Request 2 run concurrently
asyncContext.run(() => {
  // Request 1's traces are isolated
  tracedService.handleOrder("order-1");
});

asyncContext.run(() => {
  // Request 2's traces are isolated
  tracedService.handleOrder("order-2");
});
```

## 5. Manual Integration (SyncNarrativeContext)

For full manual control without middleware:

```ts
import { NarrativeTraceConfig, SyncNarrativeContext, renderIndentedText } from "@narrativetrace/core";
import { traceObject } from "@narrativetrace/proxy";

const config = new NarrativeTraceConfig();
const context = new SyncNarrativeContext(config);

// Trace services
const orderService = traceObject(new DefaultOrderService(/* deps */), context);

// Run business logic
orderService.placeOrder("C1", "P1", 2);

// Capture and render
const tree = context.captureTrace();
console.log(renderIndentedText(tree));

// Reset for next operation
context.reset();
```

### ContextSnapshot (cross-boundary propagation)

Propagation runs both ways. The snapshot carries the trace id, the launching span and the request
metadata *into* the asynchronous work, and the work traced there **comes back**: the context that
took the snapshot reports it — from the moment a call is published, not only once the scope closes.

```ts
const snapshot = context.snapshot();

// Activate in another context scope
const scope = snapshot.activate(otherContext);
try {
  tracedService.processOrder("order-1");
} finally {
  scope.close(); // hands the work back to `context`, then ends the live registration
}

// Or use the convenience wrapper
snapshot.wrapFn(otherContext, () => {
  tracedService.processOrder("order-1");
});

// Opt out when you publish the children yourself — what ForkJoinGroup and FireAndForgetGroup do.
// Registers nothing and hands nothing over, at every hop.
const detached = snapshot.activateWithoutAdoption(otherContext);
```

Placement follows **submit** time: a snapshot taken while the launching call is open makes the work a
child of that call; taken after it returned, the work is the next root of the same trace. The first
span opened under an activated snapshot is tagged `concurrency.kind === "async"`.

Adoption is bounded — 10,000 spans per context, a batch that would cross the cap refused **whole**
rather than stranding children whose parent stayed out — and the refusals are counted in
`context.traceLoss()` beside the capture buffer's own drops.

## 6. NestJS

The `@narrativetrace/nestjs` package provides `AutoProxyModule`, which auto-proxies every provider so service calls are captured without touching your business code. It runs a per-request context and fires a completion hook carrying the captured trace tree.

```ts
import { AutoProxyModule, NoAutoProxy } from "@narrativetrace/nestjs";
import { Module } from "@nestjs/common";

@Module({
  imports: [
    AutoProxyModule.forRoot({
      serviceName: "orders-api",
      level: "detail",
      // A real pipeline (e.g. wired to pino/winston/otel) — without it, traces
      // are captured but not exported.
      pipeline,
      // Providers to leave untraced.
      exclude: [HealthController],
      // Fires after each request with the captured tree, HTTP status, and duration.
      onRequestComplete: (ctx, { statusCode, durationMs, tree }) => {
        console.log(statusCode, durationMs, tree);
      },
    }),
  ],
  providers: [OrderService],
})
export class AppModule {}

// Opt a single provider out of auto-proxying:
@NoAutoProxy()
export class LegacyService {}
```

### How it works

- `AutoProxyModule` is a global module: it opens a fresh per-request context and wraps each registered provider's prototype methods with its own capture path (`wrapPrototypeMethods`) — a separate, prototype-mutating implementation from `@narrativetrace/proxy`'s `traceObject()`, not a thin wrapper over it. Every captured parameter renders as `arg0`, `arg1`, … here: this path has no decorator/reflection metadata to recover real parameter names, so the always-on NAME deny-list (which matches on *names*) cannot protect an auto-wrapped parameter. `@notTraced(i)` (from `@narrativetrace/proxy`) still works, and value-shape masking (a JWT, a card number, a national-ID checksum, a `Set-Cookie` string) still applies regardless of name — see [Privacy and Redaction § surface by surface](privacy-and-redaction.md) for the full statement of this limitation.
- It exports `NarrativeStorage`, the per-request context holder — inject it where you need direct access to the current context.
- `@NoAutoProxy()` marks an individual provider to be skipped by the auto-proxy pass.
- After each request, `onRequestComplete(ctx, { statusCode, durationMs, tree })` fires with the captured `tree`, letting you render, export, or forward the narrative. A captured request produces one trace tree spanning every proxied service call made while handling that request.

## 7. React & React Router

The `@narrativetrace/react` package captures component and service traces from your method and parameter names — no logging boilerplate in components. Wrap the tree in `NarrativeTraceProvider`, trace a service with `useTraced`, and pull the captured tree out with `useTraceCapture`:

```tsx
import {
  NarrativeTraceProvider,
  useTraced,
  useTraceCapture,
} from "@narrativetrace/react";
import { CheckoutService } from "./checkout-service";

function Checkout() {
  const checkout = useTraced(() => new CheckoutService(), "CheckoutService");
  const { captureAndReset } = useTraceCapture();

  function onPlaceOrder() {
    checkout.placeOrder("C1", "P1", 2);
    const tree = captureAndReset();
    console.log(tree.roots);
  }

  return <button onClick={onPlaceOrder}>Place order</button>;
}

export function App() {
  return (
    <NarrativeTraceProvider level="detail">
      <Checkout />
    </NarrativeTraceProvider>
  );
}
```

`useNarrativeTrace()` returns the raw context, and `useTracedFetch()` returns a `fetch` that stamps `traceparent` on outgoing requests.

### React Router navigation capture

The `@narrativetrace/react-router` package captures a fresh trace tree on every navigation, so each route change yields one self-contained trace. Render a component inside your router that calls `useNavigationCapture` — each time the pathname changes it captures the accumulated trace, hands it to your callback, and resets the context:

```tsx
import { NarrativeTraceProvider } from "@narrativetrace/react";
import { useNavigationCapture } from "@narrativetrace/react-router";
import type { TraceTree } from "@narrativetrace/core";
import { BrowserRouter } from "react-router-dom";

function NavigationTracer() {
  useNavigationCapture((tree: TraceTree) => {
    console.log("captured on navigation", tree.roots);
  });
  return null;
}

export function App() {
  return (
    <BrowserRouter>
      <NarrativeTraceProvider>
        <NavigationTracer />
        {/* routes */}
      </NarrativeTraceProvider>
    </BrowserRouter>
  );
}
```

The callback is optional — omit it to simply reset the trace on each navigation. `useNavigationCapture` must be used within both a `NarrativeTraceProvider` and a React Router context.

## 8. OpenTelemetry

The `@narrativetrace/opentelemetry` package maps method-call narratives onto OTel spans, so existing Jaeger/Tempo/Datadog views light up without hand-instrumented spans. `createOtelEventConsumer` is the live bridge — it starts/ends spans as methods execute, nesting child spans under their parent. Wire it into a pipeline: *(since 0.1.3, unreleased)*

```ts
import { AsyncNarrativeContext, BufferedEventConsumer, DualPathPipeline, NarrativeTraceConfig } from "@narrativetrace/core-node";
import { createOtelEventConsumer } from "@narrativetrace/opentelemetry";
import { trace } from "@opentelemetry/api";

const tracer = trace.getTracer("orders");
const consumer = createOtelEventConsumer({ tracer, maxActiveSpans: 1024 });

// Keep the buffered consumer alongside the live bridge — it backs captureTrace()/events().
const pipeline = new DualPathPipeline(consumer, new BufferedEventConsumer());
const context = new AsyncNarrativeContext(new NarrativeTraceConfig("detail"), pipeline);
```

For post-hoc export, `TraceSpanExporter` turns a captured `TraceNode` tree into nested spans in one pass:

```ts
import { TraceSpanExporter } from "@narrativetrace/opentelemetry";

new TraceSpanExporter(tracer).export(roots);
```

### Attribute vocabulary

Each span is stamped with `nt.trace_id` and other `nt.*` schema attributes (trace identity, depth, concurrency, level) plus typed `narrative.param.<name>` values for method parameters. The span-attribute mappers — `setSpanAttributes`, `setNtSchemaAttributes`, `setOutcomeAttributes`, `buildEventAttributes`, and friends — are exported for building custom exporters.

## 9. Winston & Pino

The `@narrativetrace/winston` and `@narrativetrace/pino` packages stream method-call events into your logger as structured, per-event lines (`→ Class.method` on entry, `← returned: …` / `!! Error` on exit) carrying `code.*`, `trace_id`, `service.*`, `nt.depth`, and typed parameters.

### Winston *(since 0.1.3, unreleased)*

```ts
import { AsyncNarrativeContext, BufferedEventConsumer, DualPathPipeline, NarrativeTraceConfig } from "@narrativetrace/core-node";
import { createWinstonEventConsumer } from "@narrativetrace/winston";
import winston from "winston";

const logger = winston.createLogger({ format: winston.format.json() });

// Entry/return default to `debug`, exceptions to `warn` — override per event.
const consumer = createWinstonEventConsumer(logger, {
  levels: { enter: "info", return: "info", exception: "error" },
});

// Keep the buffered consumer alongside the live bridge — it backs captureTrace()/events().
const pipeline = new DualPathPipeline(consumer, new BufferedEventConsumer());
const context = new AsyncNarrativeContext(new NarrativeTraceConfig("detail"), pipeline);
```

To stamp the active trace identity onto your *own* `logger.*` calls, add `createWinstonFormat()` to the logger's format chain — it merges the current `LogContext` (`trace_id`, `service.*`, `nt.depth`) into every line.

### Pino *(since 0.1.3, unreleased)*

```ts
import { AsyncNarrativeContext, BufferedEventConsumer, DualPathPipeline, NarrativeTraceConfig } from "@narrativetrace/core-node";
import { createPinoEventConsumer } from "@narrativetrace/pino";
import pino from "pino";

const logger = pino();

// Entry/return default to `trace` (pino has a real TRACE level), exceptions to `warn`.
const consumer = createPinoEventConsumer(logger, {
  levels: { enter: "info", return: "info", exception: "error" },
});

// Keep the buffered consumer alongside the live bridge — it backs captureTrace()/events().
const pipeline = new DualPathPipeline(consumer, new BufferedEventConsumer());
const context = new AsyncNarrativeContext(new NarrativeTraceConfig("detail"), pipeline);
```

To stamp the active trace identity onto your *own* `logger.*` calls, pass `createPinoMixin()` as the logger's `mixin` — it merges the current `LogContext` (`trace_id`, `service.*`, `nt.depth`) into every line.

### Per-event levels

Both consumers accept a `levels` map keyed by event kind (`enter`, `return`, `exception`), so you can raise entry/return chatter to `info` or push exceptions to `error` independently. Winston defaults to `debug`/`debug`/`warn`; Pino defaults to `trace`/`trace`/`warn`.

## See also

- [Installation Guide](installation-guide.md) — dependencies, integration paths, module selection
- [Configuration Guide](configuration-guide.md) — tracing levels, render options
- [Decorators Guide](decorators-guide.md) — `@traced`, `@narrated`, `@onError`, `@notTraced`
