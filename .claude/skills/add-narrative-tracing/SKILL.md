---
name: add-narrative-tracing
description: "Installs NarrativeTrace into a TypeScript project and gets it to a first trace. Use when NarrativeTrace is not yet installed, a project needs its very first traced call, or traces need to reach a real logger instead of a bare console.log. Installs @narrativetrace/core-node and @narrativetrace/proxy with the project's real package manager, wraps a class with traceObject, renders and runs the first trace, then wires a pino/winston/OpenTelemetry-style consumer so traces reach your logger. Ends by running narrativetrace doctor to confirm the install is correctly wired — narrativetrace-doctor owns diagnosis from there. Say 'add narrative tracing to my service', 'install narrativetrace', 'get a trace in 60 seconds', 'wrap this class so I can see a trace', or 'send my traces to my logger' to invoke it."
when_to_use: "A project does not have NarrativeTrace yet, or has the packages installed but has never produced a trace, or traces print to the console but nothing forwards them to a real logger."
allowed-tools: pnpm, npx, node
---

# add-narrative-tracing

## 1. Install with the real toolchain

```bash
pnpm install --frozen-lockfile
```

**verify:** `npx @narrativetrace/cli doctor --json | node -e "const r=JSON.parse(require('fs').readFileSync(0,'utf8')); const bad=r.findings.filter(f=>f.id.startsWith('toolchain.')&&f.status!=='pass'); if(bad.length>0){console.error(JSON.stringify(bad)); process.exit(1);}"`

**failure:** vitest peer mismatch breaks the library's own build from a clean install — an installed vitest version outside @narrativetrace/vitest's declared peer range. Fix: run the narrativetrace-doctor skill's toolchain.vitest-peer check, then install a version satisfying the printed range

## 2. First trace: wrap, call, render, run

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

**verify:** `node index.js`

**failure:** parameters render as arg0, arg1, ... — parameter names of a class you don't own (or a build that strips them) are lost at compile time. Fix: pass them explicitly: traceObject(target, context, { methodName: ["paramA", "paramB"] })

## 3. Send it to your logger

<!-- snippet: examples/sixty-seconds/index-with-logger.js -->
```js
// index-with-logger.js
import {
  NarrativeTraceConfig,
  SyncNarrativeContext,
  DualPathPipeline, // fans events out to two consumers: the pino bridge and the in-memory buffer
  BufferedEventConsumer, // keeps captureTrace() working alongside the logger
  parseTraceparent, // turns a traceparent header into the trace id fixed below
  renderMarkdownBody,
} from "@narrativetrace/core-node";
import { traceObject } from "@narrativetrace/proxy";
import { createPinoEventConsumer } from "@narrativetrace/pino"; // bridges trace events into Pino
import pino from "pino";

class OrderService {
  placeOrder(customerId, productId, quantity) {
    return `ORD-${customerId}-${productId}-${quantity}`;
  }
}

// A documented constant for THIS example only — never the library default, which always
// generates a random trace id — so nt.traceName/trace_id below stay the same phrase every time
// this page's output is regenerated.
const FIXED_TRACEPARENT = "00-a1b2c3d4a1b2c3d4a1b2c3d4a1b2c3d4-a1b2c3d4a1b2c3d4-01";
const fixedTraceId = parseTraceparent(FIXED_TRACEPARENT);

const logger = pino(); // any pino instance works — this one keeps its defaults
const pinoConsumer = createPinoEventConsumer(logger, { levels: { enter: "info", return: "info" } });
const pipeline = new DualPathPipeline(pinoConsumer, new BufferedEventConsumer());
const context = new SyncNarrativeContext(
  new NarrativeTraceConfig(),
  undefined, // parentResolver — a plain script has no ambient parent span to resolve
  pipeline, // routes events to both the logger above and the buffer captureTrace() reads
  null, // rootParentOverride — no inbound parent span for this root call
  undefined, // serviceIdentity — not needed for this example
  fixedTraceId, // seeds the trace id an inbound traceparent header would carry on a real request
);
const service = traceObject(new OrderService(), context, {
  placeOrder: ["customerId", "productId", "quantity"],
});

service.placeOrder("C1", "P1", 2);
console.log(renderMarkdownBody(context.captureTrace()));
```
<!-- /snippet -->

**verify:** `node index-with-logger.js`

## 4. Run the doctor and resolve its findings

```bash
npx @narrativetrace/cli doctor || true
```

**verify:** `npx @narrativetrace/cli doctor --json | node -e "const r=JSON.parse(require('fs').readFileSync(0,'utf8')); if(!Array.isArray(r.findings)||r.findings.length!==11) process.exit(1);"`

## Always

- Reinstall clean (a frozen-lockfile install) rather than trusting whatever is already in node_modules. (a mismatched peer or stale lockfile is the single most common install failure, and it only surfaces on a clean install)

## Never

- Never assume a step worked without running its verify. (self-reported success overstates reality — a build claimed green that does not reproduce from clean is not evidence)
- Never skip the final narrativetrace doctor call. (it is the seam that catches anything these four steps did not — narrativetrace-doctor owns diagnosis from here)
