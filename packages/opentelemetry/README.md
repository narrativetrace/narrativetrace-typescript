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
`narrative.param.<name>` values onto each span.

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

### Matching span ids

The runtime does not build your tracer provider, so build it with the helper. `narrativeTraceProviderConfig`
returns the provider options with `NarrativeTraceIdGenerator` installed; every other option passes through:

```ts
import { narrativeTraceProviderConfig } from '@narrativetrace/opentelemetry';
import { NodeTracerProvider } from '@opentelemetry/sdk-trace-node';

const provider = new NodeTracerProvider(narrativeTraceProviderConfig({ resource }));
provider.register();
```

A span's OpenTelemetry id is then its NarrativeTrace id, and a child that starts after its parent has
ended parents on the real parent. The same effect without the helper is the one-liner
`new NodeTracerProvider({ idGenerator: new NarrativeTraceIdGenerator(), ... })`. An `idGenerator` you set
yourself is kept (with one warning that ids will not mirror). Without mirroring the consumer remembers
ended parents for the span TTL and, past that, marks a reconstructed parent with
`narrative.parent.synthetic=true`. Opt out with `{ mirrorIds: false }`,
`NARRATIVETRACE_OTEL_MIRROR_IDS=false` or `new NarrativeTraceIdGenerator({ enabled: false })`. Export
each trace through one path (the live consumer or `TraceSpanExporter`), not both.

## Learn more

- [Framework Integration Guide](../../documentation/framework-integration-guide.md)
