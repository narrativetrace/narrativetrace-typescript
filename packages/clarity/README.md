# @narrativetrace/clarity

Score the naming quality of a captured trace — if the trace *is* the code, trace
quality *is* code quality.

## Install

```bash
pnpm add @narrativetrace/clarity @narrativetrace/core
```

`@narrativetrace/core` is a peer dependency.

## Usage

`analyzeClarity` takes a `TraceTree` and returns a `ClarityResult` with an
`overall` score and per-element `issues` (generic verbs, vague nouns, weak
parameter names).

```ts
import { NarrativeTraceConfig, SyncNarrativeContext } from '@narrativetrace/core';
import { traceObject } from '@narrativetrace/proxy';
import { analyzeClarity } from '@narrativetrace/clarity';

const context = new SyncNarrativeContext(new NarrativeTraceConfig());
traceObject(orderService, context).placeOrder('C1', 'P1', 2);

const result = analyzeClarity(context.captureTrace());
console.log(result.overall, result.issues); // 0.92, [ ... ]
```

The package also ships a `narrativetrace-clarity` CLI (via `bin`) that gates a
build on a suite-wide `clarity-results.json`:

```bash
narrativetrace-clarity --min-score 0.4
```

It reads `./clarity-results.json` by default (override with `--input`) and exits
non-zero when the overall score falls below the threshold, so it drops straight
into CI.

## Learn more

- [Clarity Guide](../../documentation/clarity-guide.md) — scoring model, NLP components, and the static scanner.
