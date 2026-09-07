# @narrativetrace/core

The platform-agnostic engine of NarrativeTrace: trace context, event pipeline, value rendering, and Markdown/JSON exporters — zero runtime dependencies.

## Install

```bash
pnpm add @narrativetrace/core
```

## Usage

`core` holds the context that records a trace and the renderers that turn it into
output. Method capture is driven by a runtime seam such as `@narrativetrace/proxy`.

```ts
import {
  NarrativeTraceConfig,
  SyncNarrativeContext,
  renderMarkdown,
  exportJson,
} from "@narrativetrace/core";

const context = new SyncNarrativeContext(new NarrativeTraceConfig());

// ...run traced work against `context` (e.g. via traceObject from @narrativetrace/proxy)...

const tree = context.captureTrace();
console.log(renderMarkdown(tree));
const payload = exportJson(tree, { scenario: "OrderService.placeOrder" });
```

Need to render a single value the way traces do? `renderValue` is the same primitive
the pipeline uses:

```ts
import { renderValue } from "@narrativetrace/core";

renderValue({ id: "C1", tier: "gold" }); // '{"id": "C1", "tier": "gold"}'
```

## Note — purity contract

Rendering a traced value may invoke a small, fixed set of members on your objects: a
custom `toString()`, a `@narrativeSummary` method, and any property path named in a
`@narrated`/`@onError` template. Keep those **pure** — free of side effects such as lazy
loading, counters, cache population, or I/O — exactly as you would for a debugger or
serializer. Every invocation is bounded (`maxStringLength`, `maxArrayItems`,
`maxObjectKeys`) and exception-isolated, and with tracing off no rendering happens at all.

## Learn more

- [Decorators guide](../../documentation/decorators-guide.md)
- [Configuration guide](../../documentation/configuration-guide.md)
