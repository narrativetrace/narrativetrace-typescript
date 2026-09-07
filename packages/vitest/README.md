# @narrativetrace/vitest

Auto-trace your Vitest tests — write scenarios against a real narrative context
and get trace files, per-test failure diagnostics, and clarity reports for free.

## Install

```bash
pnpm add -D @narrativetrace/vitest @narrativetrace/core-node @narrativetrace/clarity @narrativetrace/diagrams @narrativetrace/proxy vitest
```

All of the above (plus `vitest ^3`) are peer dependencies.

## Usage

`createNarrativeTest` returns a Vitest `test` extended with a `narrativeContext`
fixture. On each test it captures the trace, writes the requested `formats`, and
prints a framed narrative on failure.

```ts
import { createNarrativeTest } from '@narrativetrace/vitest';
import { traceObject } from '@narrativetrace/proxy';

const test = createNarrativeTest({ formats: ['md', 'mmd', 'clarity-json'] });

test('places an order', ({ narrativeContext }) => {
  const service = traceObject(orderService, narrativeContext);
  service.placeOrder('C1', 'P1', 2);
});
```

### Capture buffer size

Each test gets its own context over its own capture buffer, sized for a test
rather than a server: `bufferCapacity` defaults to **8192** events (~4,000 traced
calls), not the runtime's 65,536. That is an explicit argument from this package
— the runtime never detects a test framework and changes behaviour.

If a test traces more than the buffer holds, the oldest events are dropped and
the run says so, once, naming the number to raise to:

```
⚠️ NarrativeTrace dropped 40 events: the capture buffer (8192) overflowed, so
   this narrative is incomplete. Raise it with
   createNarrativeTest({ bufferCapacity: 16384 }).
```

The same sentence is appended as a footer to the Markdown and diagram artifacts,
so a saved trace never looks complete when it is not. (The JSON artifacts are
left untouched — their schema forbids extra fields.)

For suite-wide clarity, register `ClaritySuiteReporter` in your Vitest config.
It aggregates every test's clarity scenario across workers and emits a single
`clarity-results.json` — the artifact `narrativetrace-clarity` gates on.

## Learn more

- [Examples Guide](../../documentation/examples-guide.md) — runnable demos wiring up the fixture.
- [Configuration Guide](../../documentation/configuration-guide.md) — tracing levels, formats, and reporter setup.
