# See a trace in 60 seconds

No log statements, no test framework, no file to open afterward. A plain script, one run, and
the trace prints to your terminal. Everything below was run for real against the published
`@narrativetrace/core-node` and `@narrativetrace/proxy` packages (0.1.1, the version live on npm
as of this writing — run `npm view @narrativetrace/core version` for whatever is current when you
read this) — the output is pasted, not imagined. Needs Node 20+ (the published
`@narrativetrace/core` package declares it in `engines`); pnpm is shown below, npm works too, with
one difference called out in step 1.

## 1. New project, add the package(s)

```bash
mkdir narrativetrace-quickstart && cd narrativetrace-quickstart
pnpm init
pnpm add @narrativetrace/core-node @narrativetrace/proxy
```

`core-node` re-exports everything in `@narrativetrace/core` and registers the Node id generator —
importing `@narrativetrace/core` alone throws on the first traced call. `pnpm init` writes a
`package.json` with `"type": "module"`, so the `import` syntax below works with no other setup.
Using npm instead? `npm init -y` defaults to CommonJS — run `npm pkg set type=module` right after
it (before `npm add`), or the `import` in step 2 fails with `SyntaxError: Cannot use import
statement outside a module`.

## 2. The program

<!-- snippet: examples/sixty-seconds/index.js -->
```js
// index.js
import { NarrativeTraceConfig, SyncNarrativeContext, renderMarkdownBody } from "@narrativetrace/core-node";
import { traceObject } from "@narrativetrace/proxy";

class OrderService {
  placeOrder(customerId, productId, quantity) {
    return `ORD-${customerId}-${productId}-${quantity}`;
  }
}

const context = new SyncNarrativeContext(new NarrativeTraceConfig());
const service = traceObject(new OrderService(), context, {
  placeOrder: ["customerId", "productId", "quantity"],
});

service.placeOrder("C1", "P1", 2);
console.log(renderMarkdownBody(context.captureTrace()));
```
<!-- /snippet -->

`OrderService` is a plain class — no interface, no base class, no decorator required.
`traceObject()` wraps the concrete instance in an ES `Proxy`; its third argument supplies
`placeOrder`'s parameter names, because JavaScript does not retain them at runtime. Call the
wrapped object instead of the original, and every call it makes is recorded in `context`.

## 3. Run it

```bash
node index.js
```

Real output, from the run that produced this page:

<!-- snippet: examples/sixty-seconds/narrativetrace-output/sixty-seconds/console-output.txt mask=duration -->
```text
- `OrderService.placeOrder(customerId: "C1", productId: "P1", quantity: 2)` → `"ORD-C1-P1-2"` — 0.3ms
```
<!-- /snippet -->

The trailing `Nms` is wall-clock time — it will be a different number on your machine, and a
different number the next time you run it. Everything else in the line is deterministic: the
class name, the method name, the parameter names and values, and the return value.

You did not write a log statement. The narrative came from your method name, your parameter
names, and the value the method returned — the information was already there.

## What just happened

- **A context** (`new SyncNarrativeContext(new NarrativeTraceConfig())`) is where calls get
  recorded — a plain object, not a global, not a singleton. (Node code that spans an `await`
  across a request needs `AsyncNarrativeContext` instead; see the
  [Framework Integration Guide](framework-integration-guide.md).)
- **The wrap** (`traceObject(new OrderService(), context, {...})`) is the one line that turns on
  tracing for that object. Nothing about `OrderService` itself changed — no import, no base
  class, no annotation. A class you own can use the `@traced`/`@narrated` decorators instead of
  the parameter-name map; see the [Decorators Guide](decorators-guide.md).
- **Capture, then render** — `context.captureTrace()` snapshots what happened into a plain tree;
  `renderMarkdownBody()` is one of several renderers over that same tree. `renderIndentedText()`
  draws an ASCII tree instead, `@narrativetrace/diagrams` turns it into a Mermaid or PlantUML
  sequence diagram, and `@narrativetrace/browser`'s `renderToConsole()` pretty-prints it in a
  browser's DevTools console.

## Send it to your logger

The console line above is one renderer over the trace; the same trace can stream straight into
the logger you already run in production. Add the [Pino](https://github.com/pinojs/pino) bridge
(`@narrativetrace/winston` works the same way if Winston is your logger — swap the import for
`createWinstonEventConsumer`):

```diff
-import { NarrativeTraceConfig, SyncNarrativeContext, renderMarkdownBody } from "@narrativetrace/core-node";
+import { NarrativeTraceConfig, SyncNarrativeContext, DualPathPipeline, BufferedEventConsumer, renderMarkdownBody } from "@narrativetrace/core-node";
 import { traceObject } from "@narrativetrace/proxy";
+import { createPinoEventConsumer } from "@narrativetrace/pino";
+import pino from "pino";

 class OrderService {
   placeOrder(customerId, productId, quantity) {
     return `ORD-${customerId}-${productId}-${quantity}`;
   }
 }

-const context = new SyncNarrativeContext(new NarrativeTraceConfig());
+const logger = pino();
+const pinoConsumer = createPinoEventConsumer(logger, { levels: { enter: "info", return: "info" } });
+const pipeline = new DualPathPipeline(pinoConsumer, new BufferedEventConsumer());
+const context = new SyncNarrativeContext(new NarrativeTraceConfig(), undefined, pipeline);
 const service = traceObject(new OrderService(), context, {
   placeOrder: ["customerId", "productId", "quantity"],
 });

 service.placeOrder("C1", "P1", 2);
 console.log(renderMarkdownBody(context.captureTrace()));
```

```bash
npm add @narrativetrace/pino @narrativetrace/observability pino
node index.js
```

Real output, from the run that produced this page:

```text
{"level":30,"time":1789158304041,"pid":44606,"hostname":"Danijels-MacBook-Air.local","code.namespace":"OrderService","code.function":"placeOrder","nt.depth":0,"nt.parameters":[{"name":"customerId","value":"\"C1\""},{"name":"productId","value":"\"P1\""},{"name":"quantity","value":"2"}],"trace_id":"33a1c71cc9d9e84df946442b3e6387be","nt.traceName":"wooly sled plows","span_id":"8c0f8a467530ec0f","nt.storyId":"OrderService.placeOrder","nt.chapterId":"OrderService.placeOrder","nt.entryType":"entry","nt.eventType":"method_enter","nt.schemaVersion":"1.0","msg":"→ OrderService.placeOrder"}
- `OrderService.placeOrder(customerId: "C1", productId: "P1", quantity: 2)` → `"ORD-C1-P1-2"` — 1.2094590000000096ms
{"level":30,"time":1789158304042,"pid":44606,"hostname":"Danijels-MacBook-Air.local","nt.outcome":"returned","nt.depth":0,"trace_id":"33a1c71cc9d9e84df946442b3e6387be","nt.traceName":"wooly sled plows","span_id":"8c0f8a467530ec0f","nt.storyId":"OrderService.placeOrder","nt.chapterId":"OrderService.placeOrder","nt.entryType":"entry","nt.eventType":"method_exit","nt.schemaVersion":"1.0","nt.returnValue":"\"ORD-C1-P1-2\"","msg":"← returned: \"ORD-C1-P1-2\""}
```

As with the timing above, every run-specific field (`time`, `pid`, `hostname`, `trace_id`,
`span_id`, `nt.traceName`) is a different value on your machine and on every run; the shape of the
two JSON lines and the markdown line in between does not change. This proves the trace lands in
the sink you already have, with the console output untouched. Full configuration (per-event
levels, the `LogContext` mixin for stamping your own log lines, Winston setup):
[Framework Integration Guide § Winston & Pino](framework-integration-guide.md#9-winston--pino).

## Next

| You want | Go to |
|---|---|
| Use it in your tests | [Installation Guide § Option B: Vitest Plugin](installation-guide.md#option-b-vitest-plugin-auto-context--trace-output) |
| Keep a value out of the trace (redaction) | [Privacy and Redaction](privacy-and-redaction.md) |
| Score your naming clarity | [Clarity Guide](clarity-guide.md) |
| Every configuration knob | [Configuration Guide](configuration-guide.md) |
| Something above did not work as shown | [Troubleshooting](troubleshooting.md) |
