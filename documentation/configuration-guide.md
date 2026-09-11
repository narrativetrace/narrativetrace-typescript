# NarrativeTrace TypeScript Configuration Guide

This guide documents runtime and test configuration for NarrativeTrace TypeScript.

## 1. Tracing Levels (`NarrativeTraceConfig`)

`SyncNarrativeContext` and `AsyncNarrativeContext` use `NarrativeTraceConfig`, which defaults to `"detail"`.

```ts
import { NarrativeTraceConfig, SyncNarrativeContext } from "@narrativetrace/core";

const config = new NarrativeTraceConfig("narrative");
const context = new SyncNarrativeContext(config);
```

Available levels:

| Level | Behavior |
|---|---|
| `"off"` | No tracing captured |
| `"errors"` | Only exception paths captured |
| `"summary"` | Captures root entry, deepest leaf, and full exception chains |
| `"narrative"` | Captures full call flow, suppresses parameter values |
| `"detail"` | Captures full call flow with parameter values and return values |

Runtime level changes are supported:

```ts
config.level = "errors";
```

### Level helpers

```ts
import { isActiveLevel, isEnabled } from "@narrativetrace/core";

isActiveLevel("off");       // false
isActiveLevel("errors");    // true
isEnabled("detail", "narrative"); // true — detail >= narrative
isEnabled("errors", "detail");    // false — errors < detail
```

## 2. Vitest Configuration

### Basic fixture (no output)

```ts
import { narrativeTest } from "@narrativetrace/vitest";

narrativeTest("my test", ({ narrativeContext }) => {
  // narrativeContext is a SyncNarrativeContext with default config
});
```

### With file output

`createNarrativeTest` writes artifacts on its own — the artifact is the point of
using it, so there is no flag to turn on:

```ts
import { createNarrativeTest } from "@narrativetrace/vitest";

const test = createNarrativeTest({
  outputDir: "narrativetrace-output",      // default: "narrativetrace-output"
  formats: ["md", "json", "mmd", "puml"],  // default: ["md", "json", "mmd"]
});
```

Turn it off for a run that wants the console narrative and clarity/glossary
metadata but not the files — `NARRATIVETRACE_OUTPUT=false` (or `outputEnabled:
false` in code, or `"output": "false"` in the project config file). Any other
value, including the variable being unset, keeps writing.

### Output layout

Artifacts are grouped per test *module* (the test file's base name — the
platform equivalent of Java's test-class directory), with diagrams in a
mirrored tree:

```
narrativetrace-output/
  order-service/                 # from order-service.test.ts
    places_order.md              # narrative + YAML frontmatter
    places_order.json            # canonical JSON
  diagrams/
    order-service/
      places_order.mmd           # Mermaid sequence diagram
```

Tests sharing a name in different `describe` blocks stay distinct: the
suite chain is part of the file name. Both the module and test names are
sanitized, so neither can write outside `outputDir`.

### Available formats

| Format | Extension | Renderer |
|--------|-----------|----------|
| `"md"` | `.md` | `renderMarkdown()` with scenario name |
| `"json"` | `.json` | `exportJson()` with scenario metadata |
| `"mmd"` | `.mmd` | `renderMermaidSequence()` |
| `"puml"` | `.puml` | `renderPlantUmlSequence()` |
| `"clarity-json"` | `.clarity-json` | `exportClarityJson()` with analysis |
| `"canonical-json"` | `.canonical.json` | `exportCanonicalJson()` — the flat entry list |

`"json"` and `"canonical-json"` describe the same trace for different readers.
`"json"` is the nested chapter-tree envelope, shaped for humans and tooling that
walks a call tree. `"canonical-json"` is the flat array of enter/exit records
that [`schema/entry.schema.json`](../schema/entry.schema.json) declares — one
record per event, OTel-aligned keys, the format cross-platform conformance
fixtures are written in. Ask for either, or both.

It is deterministic on purpose: a trace captured without a span context (a plain
unit test) gets sequential synthetic span ids and a fixed synthetic trace id, so
two runs of the same test produce identical bytes. The aliases `canonical` and
`canonicalJson` are accepted in `NARRATIVETRACE_FORMATS`.

### Scenario names

The test name is used as the scenario name in output files. File names are sanitized (non-alphanumeric characters removed, spaces replaced with underscores):

- `"customer places order"` → `customer_places_order.md`
- `"order with quantity < 1 fails"` → `order_with_quantity__1_fails.md`

### Scenario framing

`frameScenario()` converts test names to human-readable scenario titles:

- `customerPlacesOrder` → "Customer places order"
- `customer_places_order` → "Customer places order"
- `test_should_validate_input` → "Should validate input"

## 2b. Where settings come from

Settings resolve highest-precedence-first. Each channel fills only what
the ones above it left unset:

| Precedence | Channel | Example |
|---|---|---|
| 1 (wins) | Explicit code options | `createNarrativeTest({ level: "summary" })` |
| 2 | Environment variable | `NARRATIVETRACE_LEVEL=off pnpm test` |
| 3 | Project config file | `narrativetrace.config.json` in the repo root |
| 4 | Built-in default | `level: "detail"`, `outputDir: "narrativetrace-output"`, `formats: ["md", "json", "mmd"]` |

### Project config file

Put **one** of these in your project root — whichever your team prefers:

```jsonc
// narrativetrace.config.json   (or: .narrativetracerc.json)
{
  "level": "summary",
  "outputDir": "narrativetrace-output",
  "format": "md,json"
}
```

Keys mirror the environment variables without the `NARRATIVETRACE_`
prefix: `level`, `output`, `outputDir`, `format`. `output` is the file-write
opt-out for `createNarrativeTest` — `"false"` disables it, any other string
(including `"true"`) leaves it on. Unknown keys and wrongly-typed values are
ignored, so a stray setting never breaks a run.

### Two config files is an error, not a coin flip

Shipping **both** accepted filenames fails the run immediately:

```
DuplicateConfigurationError: Multiple NarrativeTrace configuration sources
found: narrativetrace.config.json, .narrativetracerc.json.
Keep exactly one and delete the rest.
```

The same applies to a config file that is not valid JSON, or whose top
level is not an object. Silently preferring one source is how a merge
that resurrects an old config goes unnoticed for months — the run stops
instead. A *value* you got wrong is treated more gently: an
unrecognized `level` degrades to the default rather than failing.

Resolve settings yourself with `resolveConfig()` from
`@narrativetrace/core-node`; every channel is injectable
(`{ env, projectRoot, read, fallbackLevel }`) for testing.

## 3. Render Options (`renderValue`)

The `renderValue()` function serializes values to strings. It accepts options to control truncation:

```ts
import { renderValue } from "@narrativetrace/core";

renderValue(someObject, {
  maxStringLength: 200,   // default: 200 — truncate strings beyond this
  maxArrayItems: 5,       // default: 5 — show first N array elements
  maxObjectKeys: 5,       // default: 5 — show first N object keys
});
```

| Option | Default | Effect |
|--------|---------|--------|
| `maxStringLength` | 200 | Strings longer than this are truncated with `"..."` |
| `maxArrayItems` | 5 | Arrays show first N items, then `... (N total)` |
| `maxObjectKeys` | 5 | Objects show first N keys, then `... (N total)` |

### Type handling

| Type | Rendered as |
|------|-------------|
| `null` | `"null"` |
| `undefined` | `"undefined"` |
| `string` | `"\"hello\""` (quoted) |
| `number` | `"42"` |
| `boolean` | `"true"` |
| `bigint` | `"42n"` |
| `symbol` | `"Symbol(name)"` |
| `function` | `"<function>"` |
| `Array` | `[1, 2, 3]` |
| `Object` | `{"key": "value"}` |
| Circular reference | `"<circular>"` |

## 4. Markdown Options

`renderMarkdown()` accepts options for the rendered output:

```ts
import { renderMarkdown } from "@narrativetrace/core";

const markdown = renderMarkdown(tree, {
  scenarioName: "Customer places order",   // appears in YAML frontmatter
  slowThresholdMs: 200,                     // default: 200 — flag slow calls
});
```

| Option | Default | Effect |
|--------|---------|--------|
| `scenarioName` | (none) | Added to YAML frontmatter |
| `slowThresholdMs` | 200 | Calls slower than this get a warning marker |

### Output format

Markdown output includes YAML frontmatter and a nested bullet list:

```markdown
---
scenario: Customer places order
methods: 5
result: success
---

- `OrderService.placeOrder(customerId: "C1", productId: "P1", quantity: 2)` → `{"orderId": "ORD-1", ...}`
  - `CustomerService.findCustomer(customerId: "C1")` → `{"id": "C1", ...}`
  - `PaymentService.charge(customerId: "C1", amount: 59.98)` → `{"transactionId": "TX-1", ...}`
```

## 5. Parameter Redaction (`@notTraced`)

Mark sensitive parameters as redacted so values never appear in trace output:

```ts
import { notTraced } from "@narrativetrace/proxy";

class AuthService {
  @notTraced(1) // redact parameter at index 1
  login(username: string, password: string) {
    // ...
  }
}
```

Trace output shows `***` instead of the actual value:

```
AuthService.login(username: "admin", password: ***)
```

For manual (non-decorator) redaction, see the [Decorators Guide](decorators-guide.md).

## 6. Proxy Options

`traceObject()` accepts optional configuration:

```ts
import { traceObject } from "@narrativetrace/proxy";

const traced = traceObject(service, context, paramNames, {
  className: "OrderService",      // override class name (default: constructor.name)
  includeReturnValues: true,      // capture return values (default: true)
});
```

| Option | Default | Effect |
|--------|---------|--------|
| `className` | `target.constructor.name` | Class name shown in traces |
| `includeReturnValues` | `true` | When `false`, return values are not rendered |

## 7. Recommended Defaults by Environment

| Environment | Suggested level | Suggested output |
|---|---|---|
| Local feature work | `"detail"` | `formats: ["md", "json"]` |
| CI test runs | `"narrative"` or `"summary"` | `formats: ["md"]` |
| Production | `"errors"` (or `"off"`) | No file output |

## 8. Event Pipeline Buffering (`BufferedEventConsumer`)

A context built with default arguments gets a `DualPathPipeline(null, new
BufferedEventConsumer())`. The buffered path is the best-effort one: a traced call
pays one ring write, and a timer drains the ring into the event store (and to any
subscribers) on later ticks.

```ts
import { BufferedEventConsumer, DualPathPipeline, SyncNarrativeContext } from "@narrativetrace/core";

// Defaults — sized for a long-lived process on a small VM, container or cloud function.
const context = new SyncNarrativeContext(config);

// Every default is overridable, positionally: (capacity, drainIntervalMs, chunkSize)
const highThroughput = new BufferedEventConsumer(262_144, 50, 4096);
const pipeline = new DualPathPipeline(null, highThroughput);
const context2 = new SyncNarrativeContext(config, undefined, pipeline);
```

| Option | Default | Effect |
|--------|---------|--------|
| `capacity` | `65536` (2^16) | **The ring's fixed size**, and so also the cap on undrained events |
| `drainIntervalMs` | `100` | Drain period. The timer runs only while events are waiting |
| `chunkSize` | `1024` | Events drained per tick |

### The buffer is fixed-size — it never grows

`capacity` is the size of the ring, not a ceiling it works towards. There is no
initial capacity and no growth factor: sizing is one decision, made up front.

- **Nothing is allocated until the first event.** An idle context — a test that
  never traces, a request that returns early — holds `allocatedCapacity === 0`.
  The first buffered event allocates the ring **whole**, at `capacity`, and it
  stays exactly that size for the consumer's life, including across `clear()`.
- **At the cap the buffer sheds, never blocks.** The oldest unread event is
  overwritten and counted in `consumer.overflowCount()`. (`droppedCount()` is a
  different number: events not delivered because a *subscriber* was still busy.)
  A non-zero `overflowCount()` means one thing: `capacity` is too small.

### Short-lived contexts: size them down

Because the ring is allocated whole, the *first traced call* in a context pays for
the whole `capacity`. That is free for a server that builds one context and keeps
it, and it is not free for the per-request, per-test, per-browser-click pattern.
Measured per fresh consumer (allocate, two events, drain, close):

| `capacity` | cost per context |
|---|---|
| 1,024 | 0.8 µs |
| 2,048 | 1.1 µs |
| **8,192** | **3.8 µs** |
| 16,384 | 31.7 µs |
| 65,536 | 99.0 µs |

The step between 8,192 and 16,384 is not a smooth curve: 16,384 pointers is 128 KB,
which is where V8 moves a backing store into large-object space. Keep a
short-lived context's ring under that line.

`@narrativetrace/vitest` already does this for you — `createNarrativeTest()` gives
each test a context with `DEFAULT_TEST_BUFFER_CAPACITY` (8,192), overridable per
fixture with `createNarrativeTest({ bufferCapacity: 32_768 })`. If a capture window
overflows, the run says so: one warning line naming the count and the value to
raise to, plus the same sentence as a footer on the Markdown and diagram artifacts.
Note that the integration passes the size **explicitly** — the runtime never
detects a test framework and changes behaviour, because a runtime that behaves
differently under test is a runtime whose tests prove nothing.

For your own short-lived contexts, do the same at the seam that builds them:

```ts
// One context per HTTP request, sized for a request rather than a process.
const buffer = new BufferedEventConsumer(4096);
const ctx = new SyncNarrativeContext(config, undefined, new DualPathPipeline(null, buffer));
try {
  /* ... handle the request, capture the trace ... */
} finally {
  ctx.eventPipeline.close();
}
```

### The drain timer, and `close()`

- **The drain timer starts on the first buffered event and stops only when the
  buffer drains empty**, restarting on the next event. It is never cleared over a
  non-empty buffer, so a burst followed by silence is still drained to the end —
  nothing is stranded. An idle consumer holds no timer, so dropping it without
  `close()` leaves nothing rooted. On Node the timer is also `unref`'d, so a
  pending drain never keeps the process alive.

**Still call `close()` wherever a lifecycle exists** — request end, test teardown,
shutdown. It is the deterministic path: it drains the tail so a shutdown does not
lose it, stops the timer immediately rather than at the next tick, and releases
awaiters of `whenClosed()`/`whenCountReached()`. `DualPathPipeline.close()` and
`context.eventPipeline.close()` forward to it.

### Sizing rule — when to configure up

For a long-lived process, the ring only has to cover events produced *while a drain
is stalled* — it is drained every 100 ms, so overflowing the default takes ~655,000
events/s sustained across a window. Durability is not this path's job; the
pipeline's synchronous consumer is.

```
capacity ≈ peak events/s × worst tolerable drain stall (seconds)
memory once allocated ≈ capacity × ~300 B/event      (65,536 ≈ ~20 MB)
```

Worked example — a service at 1,000 req/s, 50 traced calls per request, two events
per call (enter + exit):

```
1,000 × 50 × 2            = 100,000 events/s
100,000 × 0.5 s stall     =  50,000 events  →  under 65,536, the default holds
```

Double either the rate or the tolerated stall and you are over the default: pass a
larger `capacity` (and check `overflowCount()` in staging). Memory scales linearly
with it — 262,144 is ~80 MB, which is why it is no longer the default. The
buffer will never find the room itself, so the number you pass is the number you
get: too small sheds events, too large charges every context that allocates one.

## See also

- [Installation Guide](installation-guide.md) — dependencies, integration paths, trace output setup
- [Decorators Guide](decorators-guide.md) — `@traced`, `@narrated`, `@onError`, `@notTraced`
- [Clarity Guide](clarity-guide.md) — scoring model, NLP components, static scanner
- [Framework Integration Guide](framework-integration-guide.md) — Express, Hono, browser, AsyncLocalStorage
