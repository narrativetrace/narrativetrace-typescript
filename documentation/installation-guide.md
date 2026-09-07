# NarrativeTrace TypeScript Installation Guide

This guide covers installing and wiring NarrativeTrace TypeScript in a Node.js or browser project.

## Prerequisites

- Node.js 18+
- pnpm (or npm/yarn)

## Quick Start

```bash
pnpm add @narrativetrace/core-node @narrativetrace/proxy   # Node (use @narrativetrace/core-web in the browser)
```

```ts
import { NarrativeTraceConfig, SyncNarrativeContext, renderIndentedText } from "@narrativetrace/core-node";
import { traceObject } from "@narrativetrace/proxy";

const context = new SyncNarrativeContext(new NarrativeTraceConfig());
const traced = traceObject(orderService, context);

traced.placeOrder("C1", "P1", 2);
console.log(renderIndentedText(context.captureTrace()));
```

## 1. Add Dependencies

Start with the minimum stack and then add only the integrations you need.

```bash
# Minimum — pick the platform entry point for your runtime
pnpm add @narrativetrace/core-node @narrativetrace/proxy   # Node
pnpm add @narrativetrace/core-web @narrativetrace/proxy    # Browser / Web Worker

# `core-node` and `core-web` re-export everything in `@narrativetrace/core` and register the
# platform id generator (node:crypto vs. Web Crypto). Importing `@narrativetrace/core` alone
# throws "No IdGenerator registered" on the first traced call.

# Optional integrations
pnpm add -D @narrativetrace/vitest           # Vitest plugin
pnpm add @narrativetrace/diagrams            # Mermaid + PlantUML
pnpm add @narrativetrace/clarity             # Naming clarity analysis
pnpm add @narrativetrace/browser             # Browser console + network export
pnpm add @narrativetrace/standalone          # One-file bundle for plain <script> pages (no bundler)
```

## 2. Choose an Integration Path

### Option A: ES Proxy (works in any TypeScript/JavaScript app)

```ts
// Node: "@narrativetrace/core-node" — Browser: "@narrativetrace/core-web"
import { NarrativeTraceConfig, SyncNarrativeContext, renderIndentedText } from "@narrativetrace/core-node";
import { traceObject } from "@narrativetrace/proxy";

const config = new NarrativeTraceConfig();
const context = new SyncNarrativeContext(config);

const tracedOrderService = traceObject(orderService, context, {
  placeOrder: ["customerId", "productId", "quantity"],
});

tracedOrderService.placeOrder("C1", "P1", 2);
console.log(renderIndentedText(context.captureTrace()));
context.reset();
```

Use this when you want explicit control over tracing. Works in Node, Deno, Bun, and browsers.

### Option B: Vitest Plugin (auto-context + trace output)

```bash
pnpm add -D @narrativetrace/vitest
```

#### Basic fixture (no file output)

```ts
import { narrativeTest } from "@narrativetrace/vitest";
import { traceObject } from "@narrativetrace/proxy";

narrativeTest("customer places order", ({ narrativeContext }) => {
  const traced = traceObject(orderService, narrativeContext);
  traced.placeOrder("C1", "P1", 2);
  // narrativeContext is available for assertions
});
```

#### With file output

```ts
import { createNarrativeTest } from "@narrativetrace/vitest";
import { traceObject } from "@narrativetrace/proxy";

const test = createNarrativeTest({
  outputDir: "narrativetrace-output",
  formats: ["md", "json", "mmd", "puml", "clarity-json"],
});

test("customer places order", ({ narrativeContext }) => {
  const traced = traceObject(orderService, narrativeContext);
  traced.placeOrder("C1", "P1", 2);
});
```

Features:
- Per-test `NarrativeContext` via Vitest fixture
- Automatic trace file emission after each test
- Scenario name derived from test name
- Multiple output formats: Markdown, JSON, Mermaid, PlantUML, clarity JSON

### Option C: Express/Hono Middleware

Per-request tracing in web applications using `AsyncNarrativeContext`:

```ts
import { AsyncNarrativeContext, NarrativeTraceConfig, renderIndentedText } from "@narrativetrace/core";
import { traceObject } from "@narrativetrace/proxy";
import express from "express";

const config = new NarrativeTraceConfig();
const asyncContext = new AsyncNarrativeContext(config);

const app = express();

app.use((req, res, next) => {
  asyncContext.run(() => {
    // All traced calls within this request share the same context
    next();
  });
});

app.get("/orders", (req, res) => {
  const traced = traceObject(orderService, asyncContext);
  const result = traced.placeOrder("C1", "P1", 2);
  console.log(renderIndentedText(asyncContext.captureTrace()));
  res.json(result);
});
```

### Option D: Browser (console rendering + network export)

```bash
pnpm add @narrativetrace/core-web @narrativetrace/proxy @narrativetrace/browser
```

```ts
// core-web registers the Web Crypto id generator — import it, not @narrativetrace/core
import { NarrativeTraceConfig, SyncNarrativeContext, renderIndentedText } from "@narrativetrace/core-web";
import { traceObject } from "@narrativetrace/proxy";
import { renderToConsole, postToCollector } from "@narrativetrace/browser";

const context = new SyncNarrativeContext(new NarrativeTraceConfig());
const traced = traceObject(orderService, context);

traced.placeOrder("C1", "P1", 2);
const tree = context.captureTrace();

// Show it in the page
document.querySelector("pre#trace").textContent = renderIndentedText(tree);

// Mirror it to the DevTools console
renderToConsole(tree);

// POST it as JSON to a collector endpoint (resolves for any HTTP status — check response.ok)
const response = await postToCollector(tree, { scenario: "place order" }, "https://your-collector.example.com/traces");
```

Core context, ES Proxy, and value rendering are pure JavaScript with zero Node dependencies. `AsyncLocalStorage` is Node-only; in the browser, propagate context manually via `snapshot()`.
Runnable version: `pnpm run example:browser` (see the [Examples Guide](examples-guide.md#browser)).

### Option E: Plain JavaScript page, no bundler (script tag)

```bash
pnpm add @narrativetrace/standalone
```

`@narrativetrace/standalone` ships one file containing `core-web` + `proxy` + `browser` in two shapes: `dist/narrativetrace.global.js` (classic script → `window.NarrativeTrace`) and `dist/narrativetrace.js` (ES module). Copy the one you need next to your page; loading it registers the browser id generator, so nothing else is imported.

```html
<script src="narrativetrace.global.js"></script>
<script>
  var NT = window.NarrativeTrace;
  var context = new NT.SyncNarrativeContext(new NT.NarrativeTraceConfig());
  var traced = NT.traceObject(orderService, context, { placeOrder: ["customerId", "productId", "quantity"] });

  traced.placeOrder("C1", "P1", 2);

  var tree = context.captureTrace();
  document.getElementById("trace").textContent = NT.renderIndentedText(tree);
  NT.renderToConsole(tree);
</script>
```

Runnable version: `pnpm run example:script-tag` (see the [Examples Guide](examples-guide.md#script-tag)). Prefer Option A/D with a bundler when you have one — smaller graphs and tree-shaking.

## 3. Configure Trace Output

### Vitest (recommended)

Use `createNarrativeTest` with options:

```ts
const test = createNarrativeTest({
  outputDir: "narrativetrace-output",   // default: "narrativetrace-output"
  formats: ["md", "json"],              // default: ["md", "json", "mmd"]
  bufferCapacity: 8192,                 // default: 8192 events (~4,000 traced calls)
});
```

A test that traces more than `bufferCapacity` holds loses its oldest events. It
does not do so quietly: the run prints one line naming the count and the value to
raise to, and the Markdown and diagram artifacts carry the same footer.

Available formats:

| Format | Extension | Content |
|--------|-----------|---------|
| `md` | `.md` | Markdown with YAML frontmatter |
| `json` | `.json` | JSON with enter/exit events |
| `mmd` | `.mmd` | Mermaid sequence diagram |
| `puml` | `.puml` | PlantUML sequence diagram |
| `clarity-json` | `.clarity-json` | Clarity analysis JSON |

### Manual output

For non-Vitest setups, use renderers directly:

```ts
import { renderMarkdown, renderIndentedText, renderProse, exportJson } from "@narrativetrace/core";
import { renderMermaidSequence, renderPlantUmlSequence } from "@narrativetrace/diagrams";

const tree = context.captureTrace();

// Choose your format
console.log(renderIndentedText(tree));
console.log(renderMarkdown(tree, { scenarioName: "Order placement" }));
console.log(renderProse(tree));
console.log(exportJson(tree, { scenario: "Order placement" }));
console.log(renderMermaidSequence(tree));
console.log(renderPlantUmlSequence(tree));
```

## 4. Validate Installation

Run tests:

```bash
pnpm test
```

If using `createNarrativeTest`, trace files appear in the configured output directory:

```
narrativetrace-output/
├── customer_places_order.md
├── customer_places_order.json
├── customer_places_order.mmd
├── customer_places_order.puml
└── customer_places_order.clarity-json
```

## Package Selection Reference

| Package | When to add it |
|---------|----------------|
| `@narrativetrace/core` | Always required |
| `@narrativetrace/proxy` | ES Proxy tracing (most common) |
| `@narrativetrace/vitest` | Vitest fixture and trace file emission |
| `@narrativetrace/diagrams` | Mermaid / PlantUML renderers |
| `@narrativetrace/clarity` | Naming clarity analysis and reporting |
| `@narrativetrace/browser` | Browser console rendering and network export |

## See also

- [Configuration Guide](configuration-guide.md) — tracing levels, render options, parameter redaction
- [Decorators Guide](decorators-guide.md) — `@traced`, `@narrated`, `@onError`, `@notTraced`
- [Clarity Guide](clarity-guide.md) — scoring model, NLP components, static scanner
- [Framework Integration Guide](framework-integration-guide.md) — Express, Hono, browser, AsyncLocalStorage
