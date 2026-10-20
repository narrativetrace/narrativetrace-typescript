# Send traces to the observability stack you already run

## The problem

> We already have tracing and dashboards. I am not adopting a second place to
> look — can this go into the stack we run?

Yes: one run, two consumers. The narrative lines keep going to your logger,
and the same events become OpenTelemetry spans on the way out. Below is one
checkout with both outputs side by side.

## Minimal setup

`@narrativetrace/opentelemetry` plus the OTel API, which the package leaves to
you (a peer dependency, so your SDK version wins):

```bash
npm add @narrativetrace/opentelemetry @opentelemetry/api
```

There are two ways in, and the difference is *when* a span exists:

| Mode | Export | Use it when |
|---|---|---|
| Live, as the methods run | `createOtelEventConsumer({ tracer })` | You want spans in your collector even if the process dies mid-request — this page |
| Batch, after the fact | `new TraceSpanExporter(tracer).export(context.captureTrace().roots)` | You already have a finished trace tree and want its spans exported in one pass |

Either takes a `Tracer` — in a deployment the one from the SDK you already
run, `trace.getTracer("orders")`. The live consumer is composed into the
pipeline in code; nothing discovers it. The scenario below hands in a tracer
of an in-memory provider that is never registered globally, which is also the
clearest picture of what the wiring does: a global provider would leak from one
test into the next, and an in-memory exporter has no global to leak into
([Framework Integration Guide § OpenTelemetry](../framework-integration-guide.md#8-opentelemetry)).

## The scenario

The pipeline is the only new idea: the narration consumer you already have,
with the OTel consumer beside it on the same live path. The checkout itself is
wrapped exactly as on every other page:

<!-- snippet: recipes/checkout/support/observed-context.ts -->
```ts
// support/observed-context.ts
import { mkdirSync, rmSync } from "node:fs";
import { dirname } from "node:path";
import {
  BufferedEventConsumer,
  DualPathPipeline,
  type EventConsumer,
  NarrativeTraceConfig,
  parseTraceparent,
  SyncNarrativeContext,
  type TracingLevel,
} from "@narrativetrace/core-node";
import { createOtelEventConsumer } from "@narrativetrace/opentelemetry";
import { createPinoEventConsumer } from "@narrativetrace/pino";
import type { Tracer } from "@opentelemetry/api";
import pino from "pino";

/** A fixed W3C traceparent, adopted so the embedded output names the same trace every run. */
const DEMO_TRACEPARENT = "00-c4e1d0a7c4e1d0a7c4e1d0a7c4e1d0a7-c4e1d0a7c4e1d0a7-01";

function loggerWritingTo(logFile: string): pino.Logger {
  mkdirSync(dirname(logFile), { recursive: true });
  rmSync(logFile, { force: true });
  const destination = pino.destination({ dest: logFile, sync: true });
  return pino({ level: "trace", base: null, timestamp: false }, destination);
}

/** One consumer that hands every event to each of `consumers`, in order. */
function allOf(...consumers: EventConsumer[]): EventConsumer {
  return (event) => {
    for (const consume of consumers) consume(event);
  };
}

/**
 * A context whose events go to two places at once: the project's own pino logger, and the project's
 * own OpenTelemetry tracer as spans.
 *
 * INTENT: the pipeline is the only new idea. The narration consumer you already have and the OTel
 * consumer sit side by side on the live path; the buffered path beside them is untouched, so
 * `captureTrace()` still works. Nothing is taken away from the logger to feed the exporter.
 *
 * @llmNote The OTel consumer is composed into the pipeline explicitly, with the tracer handed in,
 * rather than found through a global SDK: an in-memory exporter cannot be discovered, and a global
 * provider leaks from one test into the next.
 */
export function contextLoggingAndExporting(
  logFile: string,
  tracer: Tracer,
  level: TracingLevel = "detail",
): SyncNarrativeContext {
  const narration = createPinoEventConsumer(loggerWritingTo(logFile));
  const spans = createOtelEventConsumer({ tracer });
  const pipeline = new DualPathPipeline(allOf(narration, spans), new BufferedEventConsumer());
  return new SyncNarrativeContext(
    new NarrativeTraceConfig(level),
    undefined,
    pipeline,
    null,
    undefined,
    parseTraceparent(DEMO_TRACEPARENT)?.traceId,
  );
}
```
<!-- /snippet -->

The run builds the in-memory provider, runs the checkout, and writes the
exported spans out sorted, so one run's dump equals the next:

<!-- snippet: recipes/checkout/__tests__/observability-recipe.test.ts -->
```ts
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import type { TracingLevel } from "@narrativetrace/core-node";
import {
  BasicTracerProvider,
  InMemorySpanExporter,
  type ReadableSpan,
  SimpleSpanProcessor,
} from "@opentelemetry/sdk-trace-base";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { contextLoggingAndExporting } from "../support/observed-context.js";
import { recipeOutput } from "../support/recipe-runs.js";
import { useStableSpanIds } from "../support/stable-ids.js";
import { tracedCheckout } from "../support/wiring.js";

/**
 * Proves documentation/recipes/send-traces-to-the-observability-stack-you-already-run.md: ONE run of
 * the checkout writes the log lines it always wrote AND an OpenTelemetry span per traced call, with
 * the parentage and the attributes the page shows — and without the redacted values (release rule
 * 8, docs as tests).
 *
 * @llmNote The exported spans are written out by `dumpOf`, naming and sorting everything it prints,
 * so one run's dump is byte-identical to the next — a raw span dump carries timestamps and OTel's
 * own generated ids and could never be embedded. The provider is built here and never registered
 * globally: a global provider would leak from this test into the next.
 */
const SLUG = "send-traces-to-the-observability-stack-you-already-run";
const CARD_NUMBER = "4242424242424242";

let spans: InMemorySpanExporter;
let provider: BasicTracerProvider;

beforeEach(() => {
  useStableSpanIds();
  spans = new InMemorySpanExporter();
  provider = new BasicTracerProvider({ spanProcessors: [new SimpleSpanProcessor(spans)] });
});

afterEach(async () => {
  await provider.shutdown();
});

describe("send traces to the observability stack you already run", () => {
  it("one run narrates and exports", () => {
    const context = contextLoggingAndExporting(
      recipeOutput(SLUG, "checkout.log"),
      provider.getTracer("narrativetrace"),
    );
    const { checkout } = tracedCheckout(context);

    const orderId = checkout.placeOrder("C-1234", "SKU-KB", 2, CARD_NUMBER);

    expect(orderId).toBe("ORD-C-1234-SKU-KB-2");
    assertOneSpanPerTracedCall();
    assertNoRedactedValueWasExported();
    mkdirSync(recipeOutput(SLUG), { recursive: true });
    writeFileSync(join(recipeOutput(SLUG), "exported-spans.txt"), dumpOf(spans.getFinishedSpans()));
  });

  it("a run that throws exports the failed span with its error status", () => {
    const context = contextLoggingAndExporting(
      recipeOutput(SLUG, "declined.log"),
      provider.getTracer("narrativetrace"),
    );
    const { checkout } = tracedCheckout(context);

    expect(() => checkout.placeOrder("C-1234", "SKU-KB", 2, "4000000000000002")).toThrow();

    const failed = spans.getFinishedSpans().find((span) => span.name === "PaymentService.charge");
    expect(failed?.status.code).toBe(2);
    expect(failed?.events.map((event) => event.name)).toContain("exception");
  });
});

describe("send traces to the observability stack you already run, at other levels", () => {
  function runAt(level: TracingLevel): void {
    const context = contextLoggingAndExporting(
      recipeOutput(SLUG, `${level}.log`),
      provider.getTracer("narrativetrace"),
      level,
    );
    tracedCheckout(context).checkout.placeOrder("C-1234", "SKU-KB", 2, CARD_NUMBER);
  }

  it("summary exports the same spans without the parameter attributes", () => {
    runAt("summary");

    const exported = spans.getFinishedSpans();
    expect(exported).toHaveLength(4);
    const keys = exported.flatMap((span) => Object.keys(span.attributes));
    expect(keys.filter((key) => key.startsWith("narrative.param."))).toEqual([]);
  });

  it("off creates no event and therefore no span", () => {
    runAt("off");

    expect(spans.getFinishedSpans()).toEqual([]);
  });
});

/** Four traced calls, four spans, ended innermost first — and the tree is reconstructed. */
function assertOneSpanPerTracedCall(): void {
  const exported = spans.getFinishedSpans();
  expect(exported.map((span) => span.name)).toEqual([
    "InventoryService.reserve",
    "PaymentService.charge",
    "OrderRepository.save",
    "OrderService.placeOrder",
  ]);
  const root = named(exported, "OrderService.placeOrder");
  expect(parentNameOf(exported, named(exported, "PaymentService.charge"))).toBe(root.name);
  expect(parentNameOf(exported, root)).toBeUndefined();
  expect(new Set(exported.map((span) => span.spanContext().traceId)).size).toBe(1);
  expect(root.spanContext().traceId).not.toBe(root.attributes["nt.trace_id"]);
}

/** What the deny-list caught never reaches the exporter either — there is no attribute for it. */
function assertNoRedactedValueWasExported(): void {
  const attributes = spans.getFinishedSpans().flatMap((span) => Object.entries(span.attributes));
  const keys = attributes.map(([key]) => key);
  expect(keys).not.toContain("narrative.param.cardNumber");
  expect(keys).not.toContain("narrative.param.card");
  expect(attributes.map(([, value]) => String(value)).join("\n")).not.toContain(CARD_NUMBER);
}

function named(exported: readonly ReadableSpan[], name: string): ReadableSpan {
  const found = exported.find((span) => span.name === name);
  if (found === undefined) throw new Error(`no span named ${name}`);
  return found;
}

function parentNameOf(exported: readonly ReadableSpan[], span: ReadableSpan): string | undefined {
  return exported.find((other) => other.spanContext().spanId === span.parentSpanId)?.name;
}

/** The dump the page embeds: span name, parent, and every attribute, sorted by key. */
function dumpOf(exported: readonly ReadableSpan[]): string {
  return exported
    .map((span) => {
      const attributes = Object.entries(span.attributes)
        .sort(([a], [b]) => (a < b ? -1 : 1))
        .map(([key, value]) => `    ${key}: ${value}`);
      const parent = parentNameOf(exported, span) ?? "(none — this is the root)";
      return [`span: ${span.name}`, `  parent: ${parent}`, ...attributes].join("\n");
    })
    .join("\n")
    .concat("\n");
}
```
<!-- /snippet -->

## The actual output

**The log lines**, unchanged by any of this — the same narration
[Add logging to this service](add-logging-to-this-service.md) produces:

<!-- snippet: recipes/checkout/narrativetrace-output/recipes/send-traces-to-the-observability-stack-you-already-run/checkout.log -->
```text
{"level":10,"code.namespace":"OrderService","code.function":"placeOrder","nt.depth":0,"nt.parameters":[{"name":"customerId","value":"\"C-1234\""},{"name":"sku","value":"\"SKU-KB\""},{"name":"quantity","value":"2"},{"name":"cardNumber","value":"[REDACTED]"}],"trace_id":"c4e1d0a7c4e1d0a7c4e1d0a7c4e1d0a7","nt.traceName":"solid wand romps","span_id":"0000000000000001","nt.storyId":"OrderService.placeOrder","nt.chapterId":"OrderService.placeOrder","nt.entryType":"entry","nt.eventType":"method_enter","nt.schemaVersion":"1.0","msg":"→ OrderService.placeOrder"}
{"level":10,"code.namespace":"InventoryService","code.function":"reserve","nt.depth":1,"nt.parameters":[{"name":"sku","value":"\"SKU-KB\""},{"name":"quantity","value":"2"}],"trace_id":"c4e1d0a7c4e1d0a7c4e1d0a7c4e1d0a7","nt.traceName":"solid wand romps","span_id":"0000000000000002","parent_span_id":"0000000000000001","nt.storyId":"OrderService.placeOrder","nt.chapterId":"OrderService.placeOrder","nt.entryType":"entry","nt.eventType":"method_enter","nt.schemaVersion":"1.0","msg":"→ InventoryService.reserve"}
{"level":10,"nt.outcome":"returned","nt.depth":0,"trace_id":"c4e1d0a7c4e1d0a7c4e1d0a7c4e1d0a7","nt.traceName":"solid wand romps","span_id":"0000000000000002","parent_span_id":"0000000000000001","nt.storyId":"OrderService.placeOrder","nt.chapterId":"OrderService.placeOrder","nt.entryType":"entry","nt.eventType":"method_exit","nt.schemaVersion":"1.0","nt.returnValue":null,"msg":"← returned: null"}
{"level":10,"code.namespace":"PaymentService","code.function":"charge","nt.depth":1,"nt.parameters":[{"name":"customerId","value":"\"C-1234\""},{"name":"amountCents","value":"7998"},{"name":"card","value":"[REDACTED]"}],"trace_id":"c4e1d0a7c4e1d0a7c4e1d0a7c4e1d0a7","nt.traceName":"solid wand romps","span_id":"0000000000000003","parent_span_id":"0000000000000001","nt.storyId":"OrderService.placeOrder","nt.chapterId":"OrderService.placeOrder","nt.entryType":"entry","nt.eventType":"method_enter","nt.schemaVersion":"1.0","msg":"→ PaymentService.charge"}
{"level":10,"nt.outcome":"returned","nt.depth":0,"trace_id":"c4e1d0a7c4e1d0a7c4e1d0a7c4e1d0a7","nt.traceName":"solid wand romps","span_id":"0000000000000003","parent_span_id":"0000000000000001","nt.storyId":"OrderService.placeOrder","nt.chapterId":"OrderService.placeOrder","nt.entryType":"entry","nt.eventType":"method_exit","nt.schemaVersion":"1.0","nt.returnValue":"\"PAY-C-1234-7998\"","msg":"← returned: \"PAY-C-1234-7998\""}
{"level":10,"code.namespace":"OrderRepository","code.function":"save","nt.depth":1,"nt.parameters":[{"name":"order","value":"{\"orderId\": \"ORD-C-1234-SKU-KB-2\", \"customerId\": \"C-1234\", \"sku\": \"SKU-KB\", \"quantity\": 2, \"amountCents\": 7998}"}],"trace_id":"c4e1d0a7c4e1d0a7c4e1d0a7c4e1d0a7","nt.traceName":"solid wand romps","span_id":"0000000000000004","parent_span_id":"0000000000000001","nt.storyId":"OrderService.placeOrder","nt.chapterId":"OrderService.placeOrder","nt.entryType":"entry","nt.eventType":"method_enter","nt.schemaVersion":"1.0","msg":"→ OrderRepository.save"}
{"level":10,"nt.outcome":"returned","nt.depth":0,"trace_id":"c4e1d0a7c4e1d0a7c4e1d0a7c4e1d0a7","nt.traceName":"solid wand romps","span_id":"0000000000000004","parent_span_id":"0000000000000001","nt.storyId":"OrderService.placeOrder","nt.chapterId":"OrderService.placeOrder","nt.entryType":"entry","nt.eventType":"method_exit","nt.schemaVersion":"1.0","nt.returnValue":null,"msg":"← returned: null"}
{"level":10,"nt.outcome":"returned","nt.depth":0,"trace_id":"c4e1d0a7c4e1d0a7c4e1d0a7c4e1d0a7","nt.traceName":"solid wand romps","span_id":"0000000000000001","nt.storyId":"OrderService.placeOrder","nt.chapterId":"OrderService.placeOrder","nt.entryType":"entry","nt.eventType":"method_exit","nt.schemaVersion":"1.0","nt.returnValue":"\"ORD-C-1234-SKU-KB-2\"","msg":"← returned: \"ORD-C-1234-SKU-KB-2\""}
```
<!-- /snippet -->

**The spans that left the same run**, as the in-memory exporter received
them — name, parent and every attribute, sorted:

<!-- snippet: recipes/checkout/narrativetrace-output/recipes/send-traces-to-the-observability-stack-you-already-run/exported-spans.txt -->
```text
span: InventoryService.reserve
  parent: OrderService.placeOrder
    code.function: reserve
    code.namespace: InventoryService
    narrative.param.quantity: 2
    narrative.param.sku: SKU-KB
    nt.chapterId: OrderService.placeOrder
    nt.entryType: entry
    nt.schemaVersion: 1.0
    nt.storyId: OrderService.placeOrder
    nt.traceName: solid wand romps
    nt.trace_id: c4e1d0a7c4e1d0a7c4e1d0a7c4e1d0a7
span: PaymentService.charge
  parent: OrderService.placeOrder
    code.function: charge
    code.namespace: PaymentService
    narrative.outcome: "PAY-C-1234-7998"
    narrative.param.amountCents: 7998
    narrative.param.customerId: C-1234
    nt.chapterId: OrderService.placeOrder
    nt.entryType: entry
    nt.schemaVersion: 1.0
    nt.storyId: OrderService.placeOrder
    nt.traceName: solid wand romps
    nt.trace_id: c4e1d0a7c4e1d0a7c4e1d0a7c4e1d0a7
span: OrderRepository.save
  parent: OrderService.placeOrder
    code.function: save
    code.namespace: OrderRepository
    narrative.param.order.amountCents: 7998
    narrative.param.order.customerId: C-1234
    narrative.param.order.orderId: ORD-C-1234-SKU-KB-2
    narrative.param.order.quantity: 2
    narrative.param.order.sku: SKU-KB
    nt.chapterId: OrderService.placeOrder
    nt.entryType: entry
    nt.schemaVersion: 1.0
    nt.storyId: OrderService.placeOrder
    nt.traceName: solid wand romps
    nt.trace_id: c4e1d0a7c4e1d0a7c4e1d0a7c4e1d0a7
span: OrderService.placeOrder
  parent: (none — this is the root)
    code.function: placeOrder
    code.namespace: OrderService
    narrative.outcome: "ORD-C-1234-SKU-KB-2"
    narrative.param.customerId: C-1234
    narrative.param.quantity: 2
    narrative.param.sku: SKU-KB
    nt.chapterId: OrderService.placeOrder
    nt.entryType: entry
    nt.schemaVersion: 1.0
    nt.storyId: OrderService.placeOrder
    nt.traceName: solid wand romps
    nt.trace_id: c4e1d0a7c4e1d0a7c4e1d0a7c4e1d0a7
```
<!-- /snippet -->

## How to read it

- **Four traced calls, four spans, one tree.** The spans arrive in the order
  they *ended* — innermost first, the root last, which is how any OTel
  pipeline sees a finished tree. Parentage is not inferred from that order:
  the consumer reads each event's explicit parent span id, which is why
  `InventoryService.reserve`, `PaymentService.charge` and
  `OrderRepository.save` all name `OrderService.placeOrder` as their parent
  even though they ended before it did.
- **What each span carries.** `code.namespace` and `code.function` are the
  call; `narrative.param.<name>` is one attribute per parameter, typed
  (`narrative.param.quantity: 2` is a number, not the string `"2"`);
  `narrative.outcome` is the returned value, and it is absent on the two
  `void` calls because there was nothing to return. `nt.trace_id` and
  `nt.traceName` are NarrativeTrace's own identity for the trace, carried as
  attributes so a span in your backend can be matched to the log line that
  describes the same call — [Follow one request across
  services](follow-one-request-across-services.md) is the same id doing the
  same job across a process boundary. `nt.entryType`, `nt.schemaVersion`,
  `nt.storyId` and `nt.chapterId` mark the schema these attributes follow and
  the story the span belongs to.
- **A structured parameter arrives flattened.** `OrderRepository.save(order)`
  is one parameter, and it exported as `narrative.param.order.orderId`,
  `narrative.param.order.customerId`, `narrative.param.order.sku`,
  `narrative.param.order.quantity`, `narrative.param.order.amountCents` —
  field by field, because that is how the value was rendered: by reading its
  state.
- **Redaction reaches this path too.** There is no
  `narrative.param.cardNumber` and no `narrative.param.card` attribute on any
  span above — not an attribute holding `[REDACTED]`, no attribute at all. A
  denied value is dropped at capture, before the event exists, so no consumer
  on either path can receive it; the scenario asserts that as well as the span
  tree ([Keep secrets out of the logs](keep-secrets-out-of-the-logs.md)).
- **Which setting moved an event to which consumer.** Three decisions, in this
  order:
  1. The tracing level decides whether an event is created at all. At
     `summary` these same four spans are exported *without* the
     `narrative.param.*` attributes, because parameter values are not rendered
     at that level; at `off` there is no event, and therefore no span — the
     scenario's other two tests assert both
     ([Trace in production without the cost](trace-in-production-without-the-cost.md)).
  2. The pipeline's shape decides who sees the event. Here one live consumer —
     narration, then export — runs inline, and the buffer beside it keeps
     retention, which is what `captureTrace()` and the trace files read.
     Nothing was taken away from the logger to feed the exporter.
  3. Your logger's level decides what is *printed*. Raising the pino level
     above `trace` empties the log block above and changes nothing about the
     spans.
- **A call that throws exports the failed span.** The scenario's second test
  declines the card: `PaymentService.charge` ends with an error status and an
  `exception` event, which is what an error view in your backend keys on.
- **Why this is not a second place to look.** The spans are yours, in your
  collector, under your service name, beside the spans your framework already
  emits. What NarrativeTrace adds is a span per *traced method call* with the
  parameters and the outcome on it — one level below the HTTP span you already
  have.

## What is not captured

- **What your stack does with the spans is your stack's.** Sampling,
  retention, indexing and whether an attribute is searchable are the
  collector's and the backend's decisions. This page shows what leaves the
  process; no claim is made about any vendor's UI.
- **The ids are not shared.** OpenTelemetry generates its own trace and span
  ids for the spans it creates here (the scenario asserts the four share one
  OTel trace id, and that it is not NarrativeTrace's), and NarrativeTrace's
  identity rides along as the `nt.trace_id` / `nt.traceName` attributes. A
  span's position in your backend's waterfall is OTel's; matching it to a log
  line is the attribute's job.
- **A span that never ends is bounded, not repaired.** The live consumer
  creates a span as a method runs, so a process killed mid-call leaves one
  open; the consumer bounds how many it holds and for how long
  (`maxActiveSpans`, `spanTtlMs`). The batch exporter only ever sees finished
  trees.
- **The cost is a consumer on the caller's call path.** A consumer composed
  into the live path runs inline, so span creation is on the path of the traced
  call. That is the trade for durability, and the pipeline isolates it: a
  consumer that throws never breaks the business call.
- **Only what is traced is exported.** No span exists for a call no
  integration intercepted — the export path inherits the boundary of the
  capture path exactly.

**The skill for this:** `narrativetrace-doctor` — one wiring check per
framework integration, and it reports whether any sink actually receives what
is traced.
