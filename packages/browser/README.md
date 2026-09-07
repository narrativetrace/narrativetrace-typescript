# @narrativetrace/browser

Browser rendering and export for NarrativeTrace: print a captured trace to the devtools console, POST it to a collector, or propagate trace headers on `fetch`.

## Install

```bash
pnpm add @narrativetrace/browser @narrativetrace/core-web
```

## Usage

Use `tracedFetch` to propagate the trace context on requests, `renderToConsole` to inspect a captured tree with collapsible console groups, and `postToCollector` to ship it to a backend:

```ts
import { renderToConsole, postToCollector, tracedFetch } from "@narrativetrace/browser";
import type { NarrativeContext } from "@narrativetrace/core-web";

async function reportCheckout(ctx: NarrativeContext) {
  const fetchWithTrace = tracedFetch(ctx);
  await fetchWithTrace("/api/checkout", { method: "POST" });

  const tree = ctx.captureTrace();
  renderToConsole(tree);
  await postToCollector(tree, { scenario: "checkout" }, "https://collector.example.com/traces");
  ctx.reset();
}
```

`renderToConsole` prints each call with its parameters and outcome; `postToCollector` serializes the tree with the given metadata and POSTs it as JSON.

## Learn more

- [Main README](../../README.md) — the NarrativeTrace model, packages, and quick start.
