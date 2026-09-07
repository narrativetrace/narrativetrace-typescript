# @narrativetrace/hono

Hono middleware (edge/serverless friendly) that opens a per-request NarrativeTrace context and fires a completion callback in a `finally`, so it runs even when the handler throws.

## Install

```bash
pnpm add @narrativetrace/hono @narrativetrace/core @narrativetrace/observability hono
```

`@narrativetrace/core`, `@narrativetrace/observability`, and `hono` (>=4.0) are peer dependencies. You typically also want a context implementation such as `AsyncNarrativeContext` from `@narrativetrace/core-node`.

## Usage

```ts
import { AsyncNarrativeContext, NarrativeTraceConfig } from "@narrativetrace/core-node";
import { narrativeTrace, getNarrativeContext } from "@narrativetrace/hono";
import { traceObject } from "@narrativetrace/proxy";
import { Hono } from "hono";

const ctx = new AsyncNarrativeContext(new NarrativeTraceConfig("detail"));
const app = new Hono();

app.use(
  "*",
  narrativeTrace(ctx, {
    // Skip health checks and static assets — no context or log scope is created.
    excludedPaths: ["/health"],
    // Fires in a finally with the response status code and request duration.
    onRequestComplete: (c, ctx, { statusCode, durationMs }) => {
      console.log(c.req.path, statusCode, durationMs, ctx.captureTrace());
    },
  }),
);

app.get("/hello/:name", (c) => {
  const svc = traceObject(new GreetingService(), getNarrativeContext(c) ?? ctx);
  return c.json({ message: svc.greet(c.req.param("name")) });
});
```

`narrativeTrace` also accepts `extractRequest` and `extractUser` overrides; a throwing extractor or callback never fails the request. Use `getNarrativeContext(c)` to reach the active context inside a handler.

### `clientIp`

The default extractor never trusts the `x-forwarded-for` header — it is caller-controlled end to
end, and Hono's base package has no runtime-agnostic notion of a trusted proxy hop count the way
Express's `req.ip` does (via its `trust proxy` setting). `clientIp` is `"unknown"` unless you opt
in.

If you have a `getConnInfo` for your deployment target (`hono/deno`, `hono/bun`,
`hono/cloudflare-workers`, `@hono/node-server/conninfo` for Node, etc.) and it reports the real
peer address for your setup, wire it in with `withConnInfoClientIp`:

```ts
import { getConnInfo } from "@hono/node-server/conninfo"; // pick the helper for your runtime
import { narrativeTrace, withConnInfoClientIp } from "@narrativetrace/hono";

app.use(narrativeTrace(ctx, { extractRequest: withConnInfoClientIp(getConnInfo) }));
```

If you're behind a reverse proxy you control and know the trusted hop count, resolve `clientIp`
yourself in a custom `extractRequest` — this package deliberately ships no `x-forwarded-for`
trust-boundary parser.

## Learn more

- [Framework Integration Guide](../../documentation/framework-integration-guide.md) — Express, Hono, browser, and AsyncLocalStorage integration paths.
