---
name: add-narrative-tracing
description: "Installs NarrativeTrace into a TypeScript project and gets it to a first trace. Use when NarrativeTrace is not yet installed, a project needs its very first traced call, or traces need to reach a real logger instead of a bare console.log. Installs @narrativetrace/core-node and @narrativetrace/proxy with the project's real package manager, wraps a class with traceObject, renders and runs the first trace, then sends it to a real logger (pino, in the worked example). Applies the doctor's framework-wiring fixes for the frameworks the project already uses, and runs narrativetrace doctor to confirm the install is correctly wired — narrativetrace-doctor owns diagnosis from there — then previews installing the NarrativeTrace agent skills for next time (`narrativetrace init --dry-run`); applying that preview is left to the reader. Say 'add narrative tracing to my service', 'install narrativetrace', 'get a trace in 60 seconds', 'wrap this class so I can see a trace', or 'send my traces to my logger' to invoke it."
---

# add-narrative-tracing

## 1. Install with the real toolchain

**when:** if the project already has an application entry point — a `main` field, a start script, a web or application framework the doctor reports — add only the dependencies and leave the project's `main` field and start scripts as they are; otherwise install as written

```bash
pnpm add @narrativetrace/core-node @narrativetrace/proxy
pnpm install --frozen-lockfile
```

**verify:** `npx @narrativetrace/cli doctor --json | node -e "const r=JSON.parse(require('fs').readFileSync(0,'utf8')); const bad=r.findings.filter(f=>f.id.startsWith('toolchain.')&&f.status!=='pass'); if(bad.length>0){console.error(JSON.stringify(bad)); process.exit(1);}"`

**failure:** the project has a package-lock.json or yarn.lock rather than a pnpm-lock.yaml, or `pnpm add` just wrote a pnpm-lock.yaml beside one — this page spells its commands in pnpm, and the project uses another package manager. Fix: remove the pnpm-lock.yaml pnpm wrote; a project on npm or yarn adds the same two packages with its own add command and checks with its own clean install — the doctor prints the install line of each of its own fixes for the manager it detects

**failure:** vitest peer mismatch breaks the library's own build from a clean install — an installed vitest version outside @narrativetrace/vitest's declared peer range. Fix: run the narrativetrace-doctor skill's toolchain.vitest-peer check, then install a version satisfying the printed range

## 2. Wire the frameworks this project already uses

```bash
npx @narrativetrace/cli doctor || true
```

**verify:** `npx @narrativetrace/cli doctor --json | node -e "const r=JSON.parse(require('fs').readFileSync(0,'utf8')); const bad=r.findings.filter(f=>f.framework&&f.status!=='pass'); if(bad.length>0){console.error(JSON.stringify(bad)); process.exit(1);}"`

**failure:** the verify exits 1, printing the config.<framework>-* findings that fail — the project uses a framework whose NarrativeTrace integration is not installed, or is installed but never wired. Fix: run the doctor; apply every config.<framework>-* fix it prints, in order, as printed, then run the doctor again; a framework it reports as having no integration shipped is left alone

## 3. Make the project an ES module

**when:** if the project already has an application entry point — a `main` field, a start script, a web or application framework the doctor reports — leave its `type` field as it is: the module system is the project's, and the snippets below then follow it (`import` in an ES module, `require` in CommonJS, or the snippet saved as an `.mjs` file); otherwise make the project an ES module as follows

```bash
node -e "const fs=require('fs');const p=JSON.parse(fs.readFileSync('package.json','utf8'));p.type='module';fs.writeFileSync('package.json',JSON.stringify(p,null,2)+'\n')"
```

**verify:** `node -e "if(require('./package.json').type!=='module'){console.error('package.json has no \"type\": \"module\"');process.exit(1);}"`

**failure:** `node index.js` throws `SyntaxError: Cannot use import statement outside a module` (a Node release that detects module syntax prints a MODULE_TYPELESS_PACKAGE_JSON warning instead and reparses) — package.json has no `"type": "module"`, so Node loads the snippet's `.js` file as CommonJS, where `import` is a syntax error. Fix: run this step's command and the snippet again; in a project that stays CommonJS, save the snippet as `index.mjs` and run that

## 4. First trace: wrap, call, render, run

**when:** if the project already has tests — a `test` script in its `package.json` and a test runner among its dependencies — and the doctor reports a test integration for that runner, do not add a demo file: run one existing test through that integration with file output on (its default; leave `NARRATIVETRACE_OUTPUT` unset or not `false`), which writes that test's narrative files, `.md` and `.nt`, under `narrativetrace-output/` — the files narrativetrace-doctor, narrativetrace-verify, narrativetrace-debug and narrativetrace-explain read; print the rendered `.md` file so the trace is also on the console; the verify below is for the console demo, and in a project with tests the step is done when that test's `.md` and `.nt` files exist; a project whose tests run on a runner the doctor reports no integration for keeps that runner (this page never swaps it) and takes the no-tests path below, with the same sentence that nothing is written to disk; otherwise if the project already has an application entry point — a `main` field, a start script, a web or application framework the doctor reports — do not add a demo file: run the application the way it already runs, exercise one real boundary, and read that request's trace; the verify below is for the console demo, and in an existing application the step is done when that request's trace is in the output; otherwise create the smallest console demo as follows; nothing is written to disk by this script — the application's log is the record once the logger consumer in the later step is wired; this page never adds a test runner or a test to a project that has none.

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

// serviceName is what the platform and the OTel bridge show for this service; without it, traces
// read "unknown_service:node". Trace a class instance — a plain object would narrate as "Object".
const context = new SyncNarrativeContext(new NarrativeTraceConfig(), {
  serviceName: "order-service",
});
const service = traceObject(new OrderService(), context, {
  placeOrder: ["customerId", "productId", "quantity"],
});

service.placeOrder("C1", "P1", 2);
console.log(renderMarkdownBody(context.captureTrace()));
```
<!-- /snippet -->

**verify:** `node index.js`

**failure:** parameters render as arg0, arg1, ... — the runtime reads no parameter names from source, so a class you wrote a minute ago renders arg0 exactly as one you do not own (or a build that strips names) does. Fix: always pass them: traceObject(target, context, { methodName: ["paramA", "paramB"] })

**failure:** every span reads `Object.<method>` — traceObject names spans after the target's constructor, and an object literal's is Object. Fix: trace an instance of a class, or pass the name: traceObject(target, context, { className: 'CheckoutService' })

**failure:** a wrapped object records no spans and `console.warn` said it was not traced — its class name matches an exclude prefix: a shipped default list of framework internals applies unless NARRATIVETRACE_EXCLUDE or an `exclude` option replaces it, and an exclude wins over the wrap. Fix: trace a class of your own, or give the object the name you mean: traceObject(target, context, { className: 'CheckoutService' }); run `narrativetrace doctor` to see the exclude list in force

## 5. Name the service

```js
// In code: the identity of the context that records the trace.
const context = new SyncNarrativeContext(new NarrativeTraceConfig(), {
  serviceName: "checkout-api",
  serviceVersion: "1.4.2",
  environment: "production",
});
// Or from the environment (NARRATIVETRACE_SERVICE_NAME, NARRATIVETRACE_SERVICE_VERSION,
// NARRATIVETRACE_ENVIRONMENT): an AsyncNarrativeContext reads them itself; a SyncNarrativeContext
// takes them as { ...serviceIdentityFromEnv() }, imported from @narrativetrace/core-node.
```

**verify:** `npx @narrativetrace/cli doctor --json | node -e "const r=JSON.parse(require('fs').readFileSync(0,'utf8')); const f=r.findings.find(x=>x.id==='config.service-identity'); if(!f||f.status!=='pass'){console.error(JSON.stringify(f)); process.exit(1);}"`

**failure:** the platform, an exported chapter or a log line shows `unknown_service:node` — no service name was set: the TypeScript runtime has no other source for it, and the default says honestly that it does not know. Fix: set serviceName on the context constructor, or NARRATIVETRACE_SERVICE_NAME where the app starts (read by AsyncNarrativeContext and serviceIdentityFromEnv()), then run the doctor's config.service-identity check

## 6. Add the logger bridge

```bash
pnpm add @narrativetrace/pino pino
```

**verify:** `pnpm install --frozen-lockfile`

## 7. Send it to your logger

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
const fixedTraceId = parseTraceparent(FIXED_TRACEPARENT)?.traceId;

// Any pino instance works. `sync: true` is this script's own need, not the library's: pino's
// default destination writes on a later tick, so a script that logs and then prints can have the
// two land in either order — and a short-lived process can exit before the last line is flushed.
const logger = pino(pino.destination({ sync: true }));
const pinoConsumer = createPinoEventConsumer(logger, { levels: { enter: "info", return: "info" } });
const pipeline = new DualPathPipeline(pinoConsumer, new BufferedEventConsumer());
const context = new SyncNarrativeContext(new NarrativeTraceConfig(), {
  pipeline, // routes events to both the logger above and the buffer captureTrace() reads
  serviceName: "order-service", // what the platform and the OTel bridge show for this service
  inheritedTraceId: fixedTraceId, // seeds the trace id an inbound traceparent header would carry on a real request
});
const service = traceObject(new OrderService(), context, {
  placeOrder: ["customerId", "productId", "quantity"],
});

service.placeOrder("C1", "P1", 2);
console.log(renderMarkdownBody(context.captureTrace()));
```
<!-- /snippet -->

**verify:** `node index-with-logger.js`

## 8. Run the doctor and resolve its findings

```bash
npx @narrativetrace/cli doctor || true
```

**verify:** `npx @narrativetrace/cli doctor --json | node -e "const r=JSON.parse(require('fs').readFileSync(0,'utf8')); if(!Array.isArray(r.findings)||r.findings.length!==28) process.exit(1);"`

## 9. Install the skills for next time

**Flagged:** judgmental — the reply names the hand-off: the next session verifies with narrativetrace-verify — once a change's tests are green, it reads the trace before it reports

```bash
npx @narrativetrace/cli init --dry-run
```

**verify:** `npx @narrativetrace/cli init --dry-run --json | node -e "const r=JSON.parse(require('fs').readFileSync(0,'utf8')); if(!Array.isArray(r.actions)||r.actions.length===0||r.exitCode!==0) process.exit(1);"`

## Always

- Check the install with a clean, frozen-lockfile install after adding the packages, rather than trusting whatever is already in node_modules. (`pnpm add` installs; the clean install is the check that the lockfile it wrote reproduces — a mismatched peer or stale lockfile is the single most common install failure, and it only surfaces on a clean install)

## Never

- Never assume a step worked without running its verify. (self-reported success overstates reality — a build claimed green that does not reproduce from clean is not evidence)
- Never skip the final narrativetrace doctor call. (it is the seam that catches anything the steps before it did not — narrativetrace-doctor owns diagnosis from here)
- Never run `narrativetrace init` without `--dry-run` from this skill. (the prompt's own step 3 human gate applies the plan only after a person has seen the diff — this skill only shows it)
