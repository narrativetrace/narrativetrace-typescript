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

**when:** if the project already has an application entry point — a `main` field, a start script, a web or application framework the doctor reports — do not add a demo file: run the application the way it already runs, exercise one real boundary, and read that request's trace; the verify below is for the console demo, and in an existing application the step is done when that request's trace is in the output; otherwise create the smallest console demo as follows

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

## 5. Add the logger bridge

```bash
pnpm add @narrativetrace/pino pino
```

**verify:** `pnpm install --frozen-lockfile`

## 6. Send it to your logger

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

// Any pino instance works. `sync: true` is this script's own need, not the library's: pino's
// default destination writes on a later tick, so a script that logs and then prints can have the
// two land in either order — and a short-lived process can exit before the last line is flushed.
const logger = pino(pino.destination({ sync: true }));
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

## 7. Run the doctor and resolve its findings

```bash
npx @narrativetrace/cli doctor || true
```

**verify:** `npx @narrativetrace/cli doctor --json | node -e "const r=JSON.parse(require('fs').readFileSync(0,'utf8')); if(!Array.isArray(r.findings)||r.findings.length!==25) process.exit(1);"`

## 8. Install the skills for next time

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
