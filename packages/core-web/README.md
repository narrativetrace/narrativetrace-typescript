# @narrativetrace/core-web

The browser runtime seam for NarrativeTrace: registers a Web Crypto id generator and re-exports all of `@narrativetrace/core`.

## Install

```bash
pnpm add @narrativetrace/core-web
```

## Usage

Import from `core-web` instead of `core` in browser bundles. The import side-effect wires
`crypto.getRandomValues` as the trace/span id source; everything else is re-exported from
`core`, so the API is identical.

```ts
import {
  NarrativeTraceConfig,
  SyncNarrativeContext,
  renderMarkdown,
} from "@narrativetrace/core-web";

const context = new SyncNarrativeContext(new NarrativeTraceConfig());

// ...run traced work against `context`...

console.log(renderMarkdown(context.captureTrace()));
```

## Learn more

- [Decorators guide](../../documentation/decorators-guide.md)
- [Configuration guide](../../documentation/configuration-guide.md)
