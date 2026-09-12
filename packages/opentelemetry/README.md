# @narrativetrace/opentelemetry

OpenTelemetry bridge: maps NarrativeTrace method-call narratives onto OTel spans so your existing Jaeger/Tempo/Datadog trace views light up without hand-instrumented spans.

## Install

```bash
pnpm add @narrativetrace/opentelemetry @opentelemetry/api @narrativetrace/core
```

`@opentelemetry/api` and `@narrativetrace/core` are peer dependencies.

## Usage

`createOtelEventConsumer` is the live bridge — it starts/ends spans as methods execute, nesting
child spans under their parent and stamping `nt.trace_id`/`nt.*` schema attributes plus typed
`narrative.param.<name>` values onto each span. *(since 0.1.3, unreleased)*

```ts
import { AsyncNarrativeContext, BufferedEventConsumer, DualPathPipeline, NarrativeTraceConfig } from '@narrativetrace/core-node';
import { createOtelEventConsumer } from '@narrativetrace/opentelemetry';
import { trace } from '@opentelemetry/api';

const tracer = trace.getTracer('orders');
const consumer = createOtelEventConsumer({ tracer, maxActiveSpans: 1024 });

// Keep the buffered consumer alongside the live bridge — it backs captureTrace()/events().
const pipeline = new DualPathPipeline(consumer, new BufferedEventConsumer());
const context = new AsyncNarrativeContext(new NarrativeTraceConfig('detail'), pipeline);
```

For post-hoc export, `TraceSpanExporter` turns a captured `TraceNode` tree into nested spans in one
pass — `new TraceSpanExporter(tracer).export(roots)`. The span-attribute mappers
(`setSpanAttributes`, `setOutcomeAttributes`, `buildEventAttributes`, and friends) are exported for
custom exporters.

## Learn more

- [Framework Integration Guide](../../documentation/framework-integration-guide.md)
