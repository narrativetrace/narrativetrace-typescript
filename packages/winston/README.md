# @narrativetrace/winston

Streams NarrativeTrace method-call events into a [Winston](https://github.com/winstonjs/winston) logger as structured, per-event log lines with typed fields and configurable levels.

## Install

```bash
pnpm add @narrativetrace/winston winston @narrativetrace/core @narrativetrace/observability
```

`winston`, `@narrativetrace/core`, and `@narrativetrace/observability` are peer dependencies.

## Usage

`createWinstonEventConsumer` turns each `enter`/`exit` event into a Winston line
(`→ Class.method` on entry, `← returned: …` / `!! Error` on exit) carrying `code.*`,
`trace_id`, `service.*`, `nt.depth`, and typed parameters. Wire it into a context pipeline:

```ts
import { AsyncNarrativeContext, DualPathPipeline, NarrativeTraceConfig } from '@narrativetrace/core-node';
import { createWinstonEventConsumer } from '@narrativetrace/winston';
import winston from 'winston';

const logger = winston.createLogger({ format: winston.format.json() });

// Entry/return default to `debug`, exceptions to `warn` — override per event.
const consumer = createWinstonEventConsumer(logger, {
  levels: { enter: 'info', return: 'info', exception: 'error' },
});

const pipeline = new DualPathPipeline(consumer, null);
const context = new AsyncNarrativeContext(new NarrativeTraceConfig('detail'), pipeline);
```

To stamp the active trace identity onto your *own* `logger.*` calls, add `createWinstonFormat()`
to the logger's format chain — it merges the current `LogContext` (`trace_id`, `service.*`,
`nt.depth`) into every line.

## Learn more

- [Framework Integration Guide](../../documentation/framework-integration-guide.md)
