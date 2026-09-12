# @narrativetrace/pino

Streams NarrativeTrace method-call events into a [Pino](https://github.com/pinojs/pino) logger as structured, per-event log lines with typed fields and configurable levels.

## Install

```bash
pnpm add @narrativetrace/pino pino @narrativetrace/core @narrativetrace/observability
```

`pino`, `@narrativetrace/core`, and `@narrativetrace/observability` are peer dependencies.

## Usage

`createPinoEventConsumer` turns each `enter`/`exit` event into a Pino line
(`→ Class.method` on entry, `← returned: …` / `!! Error` on exit) carrying `code.*`,
`trace_id`, `service.*`, `nt.depth`, and typed parameters. Wire it into a context pipeline: *(since 0.1.3, unreleased)*

```ts
import { AsyncNarrativeContext, BufferedEventConsumer, DualPathPipeline, NarrativeTraceConfig } from '@narrativetrace/core-node';
import { createPinoEventConsumer } from '@narrativetrace/pino';
import pino from 'pino';

const logger = pino();

// Entry/return default to `trace` (pino has a real TRACE level), exceptions to `warn`.
const consumer = createPinoEventConsumer(logger, {
  levels: { enter: 'info', return: 'info', exception: 'error' },
});

// Keep the buffered consumer alongside the live bridge — it backs captureTrace()/events().
const pipeline = new DualPathPipeline(consumer, new BufferedEventConsumer());
const context = new AsyncNarrativeContext(new NarrativeTraceConfig('detail'), pipeline);
```

To stamp the active trace identity onto your *own* `logger.*` calls, pass `createPinoMixin()`
as the logger's `mixin` — it merges the current `LogContext` (`trace_id`, `service.*`,
`nt.depth`) into every line.

## Learn more

- [Framework Integration Guide](../../documentation/framework-integration-guide.md)
