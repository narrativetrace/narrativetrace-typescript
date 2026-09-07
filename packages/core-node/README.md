# @narrativetrace/core-node

The Node runtime seam for NarrativeTrace: `AsyncLocalStorage`-backed context, `NARRATIVETRACE_*` environment config, and graceful shutdown auto-flush. Re-exports all of `@narrativetrace/core`.

## Install

```bash
pnpm add @narrativetrace/core-node
```

## Usage

Import from `core-node` instead of `core` on the server — it registers a crypto-strong
id generator and adds Node-only helpers, while re-exporting everything from `core`.

```ts
import {
  NarrativeTraceConfig,
  AsyncNarrativeContext,
  BufferedEventConsumer,
  DualPathPipeline,
  resolveEnvConfig,
  registerAutoFlush,
} from "@narrativetrace/core-node";

const { level } = resolveEnvConfig(); // reads NARRATIVETRACE_LEVEL, ...
const consumer = new BufferedEventConsumer();
const context = new AsyncNarrativeContext(
  new NarrativeTraceConfig(level),
  new DualPathPipeline(null, consumer),
);

// Each request runs in its own AsyncLocalStorage-scoped trace:
context.run(() => {
  // ...handle the request; traced work sees this request's context...
});

// Drain buffered tail events on beforeExit / SIGTERM:
registerAutoFlush(consumer);
```

## Learn more

- [Decorators guide](../../documentation/decorators-guide.md)
- [Configuration guide](../../documentation/configuration-guide.md)
- [Project README](../../README.md)
