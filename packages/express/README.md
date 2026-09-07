# @narrativetrace/express

Express middleware that opens a per-request NarrativeTrace context, stamps request/user metadata onto the trace, and fires a completion callback when the response is sent.

## Install

```bash
pnpm add @narrativetrace/express @narrativetrace/core @narrativetrace/observability express
```

`@narrativetrace/core`, `@narrativetrace/observability`, and `express` (>=4.17) are peer dependencies. You typically also want a context implementation such as `AsyncNarrativeContext` from `@narrativetrace/core-node`.

## Usage

```ts
import { AsyncNarrativeContext, NarrativeTraceConfig } from "@narrativetrace/core-node";
import { narrativeTrace, getNarrativeContext } from "@narrativetrace/express";
import { traceObject } from "@narrativetrace/proxy";
import express from "express";

const ctx = new AsyncNarrativeContext(new NarrativeTraceConfig("detail"));
const app = express();

app.use(
  narrativeTrace(ctx, {
    // Skip health checks and static assets — no context or log scope is created.
    excludedPaths: ["/health"],
    // Fires on res "finish" with the sent status code and request duration.
    onRequestComplete: (_req, _res, ctx, { statusCode, durationMs }) => {
      console.log(statusCode, durationMs, ctx.captureTrace());
    },
  }),
);

app.get("/hello/:name", (req, res) => {
  const svc = traceObject(new GreetingService(), getNarrativeContext(req) ?? ctx);
  res.json({ message: svc.greet(req.params.name) });
});
```

`narrativeTrace` also accepts `extractRequest` and `extractUser` overrides; a throwing extractor or callback never fails the request. Use `getNarrativeContext(req)` to reach the active context inside a handler.

## Learn more

- [Framework Integration Guide](../../documentation/framework-integration-guide.md) — Express, Hono, browser, and AsyncLocalStorage integration paths.
