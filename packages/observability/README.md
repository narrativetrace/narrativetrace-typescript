# @narrativetrace/observability

Logger-agnostic enrichment layer: keeps the active trace identity (`code.*`, `trace_id`, `service.*`, `nt.depth`) in a scoped `LogContext` so any log line can be correlated to the narrative that produced it.

## Install

```bash
pnpm add @narrativetrace/observability @narrativetrace/core
```

`@narrativetrace/core` is a peer dependency.

## Usage

`createEnricherEventConsumer` follows the trace and keeps `LogContext` current; `createLogEnricher`
adapts that context to any logger callback. Downstream `@narrativetrace/winston` and
`@narrativetrace/pino` build on this same `LogContext`.

```ts
import { AsyncNarrativeContext, DualPathPipeline, NarrativeTraceConfig } from '@narrativetrace/core-node';
import { createEnricherEventConsumer, createLogEnricher } from '@narrativetrace/observability';

const enricher = createEnricherEventConsumer();
const pipeline = new DualPathPipeline(enricher, null);
const context = new AsyncNarrativeContext(new NarrativeTraceConfig('detail'), pipeline);

// Stamp the current trace identity onto your own logger.
const enrich = createLogEnricher((fields) => myLogger.child(fields));
enrich();
```

For HTTP servers, `withRequestTrace(context, request, fn)` opens a per-request scope and seeds
`nt.http.*`, `nt.enduser.id`, and related fields (via `buildRequestLogValues` / the `RequestInfo`
shape) for the duration of the handler.

## Learn more

- [Framework Integration Guide](../../documentation/framework-integration-guide.md)
