# Follow a flow across threads

## The problem

> The checkout hands the slow parts to background work. The trace stops at the
> hand-off and I cannot see what the background work did.

Node runs your JavaScript on one thread, so "across threads" here means
*across asynchronous scopes*: tasks that run side by side, and workers that
were started before the request ever arrived. What follows a request through
ordinary `await`s is the scope of its `AsyncLocalStorage`; what does not follow
it is anything that runs in another scope. Handing work to that scope hands
over the work and nothing else — the trace has to be handed over too,
explicitly, at launch time. Below is one run that does, and one that does not.

## Minimal setup

Nothing beyond the [install](../installation-guide.md): `ForkJoinGroup` and
`FireAndForgetGroup` are in `@narrativetrace/core-node`, beside the context
itself. Which one depends on what the caller does next:

| The launching call | The helper | The ending step |
|---|---|---|
| Waits for the background work (this page) | `ForkJoinGroup.all(context, tasks)`, or `create()` + `fork()` + `await join()` | `join()`, after the tasks settle — it publishes what they recorded under the launching span |
| Returns without waiting | `FireAndForgetGroup.create(context).launch(task)` | None. Each task is published when it settles, and a failing task cannot break the launching flow |

Each task receives a forked context that carries the caller's trace id and the
span that launched it. Anything traced inside the task has to be traced *by
that context* — which is why the scenario below builds its collaborators per
context. If your framework already propagates the scope (an Express or Hono
request wrapped by `@narrativetrace/express` / `@narrativetrace/hono`, an
awaited chain inside it), you write neither of the above. The
[Feature Guide](../feature-guide.md) is the row-by-row version.

The log lines use the same pino bridge as
[Follow one request across services](follow-one-request-across-services.md),
with the context asynchronous, because the trace id is the thing being
followed.

## The scenario

**The checkout, with the two slow steps side by side.** The handover is
`ForkJoinGroup.all` around the two tasks, each doing its work through
collaborators traced by its own forked context:

<!-- snippet: recipes/checkout/src/parallel-checkout.ts -->
```ts
// src/parallel-checkout.ts
import { ForkJoinGroup, type NarrativeContext } from "@narrativetrace/core-node";
import type { FraudCheckService } from "./fraud-check.js";
import type { InventoryService } from "./inventory.js";
import type { Order, OrderRepository } from "./orders.js";
import { PaymentDeclinedError, type PaymentService } from "./payments.js";
import type { RemoteOrderService } from "./remote-order-service.js";

const UNIT_PRICE_CENTS = 3999;

/** The collaborators of one checkout, as traced by one particular context. */
export interface ParallelCollaborators {
  readonly inventory: InventoryService;
  readonly fraud: FraudCheckService;
  readonly payments: PaymentService;
  readonly orders: OrderRepository;
}

/** Builds the collaborators traced by `context` — the caller's, or a forked task's. */
export type CollaboratorsFor = (context: NarrativeContext) => ParallelCollaborators;

/**
 * The checkout with its two slow steps run side by side: reserve the stock and ask the fraud check
 * at once, wait for both, then charge and save.
 *
 * INTENT: shows the handover for documentation/recipes/follow-a-flow-across-threads.md.
 * `ForkJoinGroup.all` gives each task a forked context that carries the caller's trace id and the
 * span that launched it, so a task must do its traced work through collaborators traced by THAT
 * context — hence `collaboratorsFor`, called once for the caller and once per task. The group joins
 * the tasks back under the launching span when every one has settled.
 *
 * @llmNote Reaching for the caller's own traced collaborators inside a task is the mistake this
 * class exists to avoid: the call would run, and the trace would not know the task belonged to it.
 *
 * @sideEffects Reserves stock; a refused order releases the reservation before it throws, like
 * `DefaultOrderService`.
 */
export class ParallelCheckout implements RemoteOrderService {
  private readonly local: ParallelCollaborators;

  constructor(
    private readonly context: NarrativeContext,
    private readonly collaboratorsFor: CollaboratorsFor,
  ) {
    this.local = collaboratorsFor(context);
  }

  async placeOrder(
    customerId: string,
    sku: string,
    quantity: number,
    cardNumber: string,
  ): Promise<string> {
    const amountCents = UNIT_PRICE_CENTS * quantity;
    const [, approved] = await ForkJoinGroup.all(this.context, [
      (forked) => this.collaboratorsFor(forked).inventory.reserve(sku, quantity),
      (forked) => this.collaboratorsFor(forked).fraud.approve(customerId, amountCents),
    ]);
    if (!approved) {
      this.local.inventory.release(sku, quantity);
      throw new PaymentDeclinedError("the fraud check refused the order");
    }
    this.local.payments.charge(customerId, amountCents, cardNumber);
    const orderId = `ORD-${customerId}-${sku}-${quantity}`;
    const order: Order = { orderId, customerId, sku, quantity, amountCents };
    this.local.orders.save(order);
    return orderId;
  }
}
```
<!-- /snippet -->

**The same work without the handover.** A worker started before any request
runs the jobs it is handed in the scope it started in, which is what a queue
consumer, a pool's callback or an event-driven loop does:

<!-- snippet: recipes/checkout/support/background-worker.ts -->
```ts
// support/background-worker.ts
import { EventEmitter, once } from "node:events";

/**
 * A long-lived worker started before any request, which runs the jobs it is handed in the
 * asynchronous scope it was started in — the shape of a queue consumer, a connection pool's callback
 * or an event-driven worker.
 *
 * INTENT: the "no handover" half of documentation/recipes/follow-a-flow-across-threads.md. A job
 * handed to this worker travels as a closure and nothing else: it runs in the worker's own scope,
 * not the scope of the request that submitted it, so the request's trace does not come with it.
 *
 * @llmNote The worker waits on an event emitter it created at start-up. A promise continues in the
 * scope that awaited it, so the job resumes in the worker's scope whoever emits — which is exactly
 * what makes this a faithful stand-in for a worker thread, a timer owned by a pool or a consumer
 * loop, and why a plain `await` of the job's result inside the request does not change that.
 */
export class BackgroundWorker {
  private readonly inbox = new EventEmitter();
  private readonly stopped = new AbortController();
  private readonly serving: Promise<void>;

  constructor() {
    this.serving = this.serve();
  }

  /** Hands `job` to the worker and resolves with its result once the worker has run it. */
  run<T>(job: () => T | Promise<T>): Promise<T> {
    return new Promise<T>((resolve, reject) => {
      this.inbox.emit("job", () => Promise.resolve().then(job).then(resolve, reject));
    });
  }

  async stop(): Promise<void> {
    this.stopped.abort();
    await this.serving;
  }

  private async serve(): Promise<void> {
    try {
      for (;;) {
        const [job] = (await once(this.inbox, "job", { signal: this.stopped.signal })) as [
          () => Promise<void>,
        ];
        await job();
      }
    } catch (error) {
      if ((error as Error).name !== "AbortError") throw error;
    }
  }
}
```
<!-- /snippet -->

**The run — and the same work without the handover.** The second test submits a
traced call to that worker with no group and no fork, which is what the code
looked like before the handover was added:

<!-- snippet: recipes/checkout/__tests__/across-threads-recipe.test.ts -->
```ts
import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import {
  type AsyncNarrativeContext,
  parseTraceparent,
  renderStructuralDocument,
  type TraceId,
  type TraceNode,
} from "@narrativetrace/core-node";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { FRAUD_LIMIT_CENTS } from "../src/fraud-check.js";
import { BackgroundWorker } from "../support/background-worker.js";
import { tracedParallelCheckout } from "../support/parallel-wiring.js";
import { recipeOutput } from "../support/recipe-runs.js";
import { serviceContextLoggingTo } from "../support/service-log.js";
import { useNumberedTraceIds, useStableSpanIds } from "../support/stable-ids.js";

/**
 * Proves documentation/recipes/follow-a-flow-across-threads.md: the two tasks the checkout hands to
 * a `ForkJoinGroup` stay inside the caller's trace, and a job handed to a long-lived worker with no
 * handover starts a trace of its own (release rule 8, docs as tests).
 *
 * @llmNote The no-handover run's log is not embedded: its trace id is minted fresh every run, which
 * is the finding it reports and the one thing no embedded block can hold. The test asserts it by
 * reading the id the worker saw.
 */
const SLUG = "follow-a-flow-across-threads";
const DEMO_TRACE_ID = parseTraceparent(
  "00-c4e1d0a7c4e1d0a7c4e1d0a7c4e1d0a7-c4e1d0a7c4e1d0a7-01",
)?.traceId;

let context: AsyncNarrativeContext;

beforeEach(useStableSpanIds);

/** A context that logs to `fileName` under this page's output directory. */
function contextLoggingTo(fileName: string): AsyncNarrativeContext {
  return serviceContextLoggingTo(recipeOutput(SLUG, fileName));
}

function names(nodes: readonly TraceNode[]): string[] {
  return nodes.map((node) => `${node.signature.className}.${node.signature.methodName}`);
}

describe("follow a flow across threads", () => {
  it("the background tasks stay in the customers trace", async () => {
    context = contextLoggingTo("checkout.log");
    const { checkout, stock, repository } = tracedParallelCheckout(context);

    const trace = await context.run(async () => {
      const orderId = await checkout.placeOrder("C-1234", "SKU-KB", 2, "4242424242424242");
      expect(orderId).toBe("ORD-C-1234-SKU-KB-2");
      return context.captureTrace();
    }, DEMO_TRACE_ID);

    expect(stock.availableUnits("SKU-KB")).toBe(3);
    expect(repository.saved()).toHaveLength(1);
    writeFileSync(
      join(recipeOutput(SLUG), "checkout.nt"),
      `${renderStructuralDocument(trace, "the background tasks stay in the customers trace")}\n`,
    );
    assertTheChildrenCameHome(trace.roots[0] as TraceNode);
    assertTheLogCarriesTheForkLifecycle(recipeOutput(SLUG, "checkout.log"));
  });

  it("a refused order releases the reservation the task made", async () => {
    context = contextLoggingTo("refused.log");
    const { checkout, stock } = tracedParallelCheckout(context, 100);
    const quantityOverTheLimit = Math.ceil(FRAUD_LIMIT_CENTS / 3999) + 1;

    const attempt = context.run(
      () => checkout.placeOrder("C-1234", "SKU-KB", quantityOverTheLimit, "4242424242424242"),
      DEMO_TRACE_ID,
    );

    await expect(attempt).rejects.toThrow("the fraud check refused the order");
    expect(stock.availableUnits("SKU-KB")).toBe(100);
  });
});

describe("follow a flow across threads, without the handover", () => {
  let worker: BackgroundWorker;

  beforeEach(() => {
    useNumberedTraceIds();
    worker = new BackgroundWorker();
  });

  afterEach(async () => {
    await worker.stop();
  });

  it("a job handed to a worker without the handover starts a new trace", async () => {
    context = contextLoggingTo("no-handover.log");
    const { stock, collaboratorsFor } = tracedParallelCheckout(context);
    let seenByTheWorker: TraceId | undefined;

    const caller = await context.run(async () => {
      // No ForkJoinGroup, no snapshot: the job is handed over, the trace is not.
      await worker.run(() => {
        collaboratorsFor(context).inventory.reserve("SKU-KB", 2);
        seenByTheWorker = context.traceId();
      });
      return { traceId: context.traceId(), trace: context.captureTrace() };
    }, DEMO_TRACE_ID);

    expect(stock.availableUnits("SKU-KB")).toBe(3);
    expect(seenByTheWorker).toBeDefined();
    expect(seenByTheWorker).not.toBe(caller.traceId);
    expect(names(caller.trace.roots)).not.toContain("InventoryService.reserve");
    expect(readFileSync(recipeOutput(SLUG, "no-handover.log"), "utf-8")).toContain(
      `"trace_id":"${seenByTheWorker}"`,
    );
  });
});

/** The log names the group: one launch line per member, then the join that closes it. */
function assertTheLogCarriesTheForkLifecycle(logFile: string): void {
  const lines = readFileSync(logFile, "utf-8")
    .trim()
    .split("\n")
    .map((line) => JSON.parse(line));
  const launches = lines.filter((line) => line["nt.eventType"] === "fork");
  const joins = lines.filter((line) => line["nt.eventType"] === "join");
  expect(launches).toHaveLength(2);
  expect(joins).toHaveLength(1);
  const groupId = joins[0]["nt.groupId"];
  expect(joins[0].msg).toBe(`⑃ fork joined [groupId: ${groupId}, members: 2]`);
  expect(launches.map((line) => line["nt.groupId"])).toEqual([groupId, groupId]);
}

/** The merged children are under the span that launched them, in the caller's own trace. */
function assertTheChildrenCameHome(root: TraceNode): void {
  expect(names(root.children)).toEqual([
    "InventoryService.reserve",
    "FraudCheckService.approve",
    "PaymentService.charge",
    "OrderRepository.save",
  ]);
  for (const task of root.children.slice(0, 2)) {
    expect(task.spanContext?.traceId).toBe(root.spanContext?.traceId);
    expect(task.spanContext?.parentSpanId).toBe(root.spanContext?.spanId);
    expect(task.concurrency?.kind).toBe("fork-join");
  }
}
```
<!-- /snippet -->

## The actual output

**The log of the run that keeps the trace:**

<!-- snippet: recipes/checkout/narrativetrace-output/recipes/follow-a-flow-across-threads/checkout.log -->
```text
{"level":10,"code.namespace":"OrderService","code.function":"placeOrder","nt.depth":0,"nt.parameters":[{"name":"customerId","value":"\"C-1234\""},{"name":"sku","value":"\"SKU-KB\""},{"name":"quantity","value":"2"},{"name":"cardNumber","value":"[REDACTED]"}],"trace_id":"c4e1d0a7c4e1d0a7c4e1d0a7c4e1d0a7","nt.traceName":"solid wand romps","span_id":"0000000000000001","nt.storyId":"OrderService.placeOrder","nt.chapterId":"OrderService.placeOrder","nt.entryType":"entry","nt.eventType":"method_enter","nt.schemaVersion":"1.0","msg":"→ OrderService.placeOrder"}
{"level":10,"code.namespace":"InventoryService","code.function":"reserve","nt.depth":1,"nt.parameters":[{"name":"sku","value":"\"SKU-KB\""},{"name":"quantity","value":"2"}],"trace_id":"c4e1d0a7c4e1d0a7c4e1d0a7c4e1d0a7","nt.traceName":"solid wand romps","span_id":"0000000000000002","parent_span_id":"0000000000000001","nt.entryType":"entry","nt.eventType":"method_enter","nt.schemaVersion":"1.0","msg":"→ InventoryService.reserve"}
{"level":10,"nt.outcome":"returned","nt.depth":0,"trace_id":"c4e1d0a7c4e1d0a7c4e1d0a7c4e1d0a7","nt.traceName":"solid wand romps","span_id":"0000000000000002","parent_span_id":"0000000000000001","nt.entryType":"entry","nt.eventType":"method_exit","nt.schemaVersion":"1.0","nt.returnValue":null,"msg":"← returned: null"}
{"level":10,"code.namespace":"FraudCheckService","code.function":"approve","nt.depth":1,"nt.parameters":[{"name":"customerId","value":"\"C-1234\""},{"name":"amountCents","value":"7998"}],"trace_id":"c4e1d0a7c4e1d0a7c4e1d0a7c4e1d0a7","nt.traceName":"solid wand romps","span_id":"0000000000000003","parent_span_id":"0000000000000001","nt.entryType":"entry","nt.eventType":"method_enter","nt.schemaVersion":"1.0","msg":"→ FraudCheckService.approve"}
{"level":10,"nt.outcome":"returned","nt.depth":0,"trace_id":"c4e1d0a7c4e1d0a7c4e1d0a7c4e1d0a7","nt.traceName":"solid wand romps","span_id":"0000000000000003","parent_span_id":"0000000000000001","nt.entryType":"entry","nt.eventType":"method_exit","nt.schemaVersion":"1.0","nt.returnValue":"true","msg":"← returned: true"}
{"level":10,"nt.eventType":"fork","nt.groupId":"fork-1","nt.strategy":"fork-join","span_id":"0000000000000002","parent_span_id":"0000000000000001","nt.entryType":"entry","nt.schemaVersion":"1.0","msg":"⑂ fork group created [groupId: fork-1]"}
{"level":10,"nt.eventType":"fork","nt.groupId":"fork-1","nt.strategy":"fork-join","span_id":"0000000000000003","parent_span_id":"0000000000000001","nt.entryType":"entry","nt.schemaVersion":"1.0","msg":"⑂ fork group created [groupId: fork-1]"}
{"level":10,"nt.eventType":"join","nt.groupId":"fork-1","nt.memberCount":2,"nt.entryType":"entry","nt.schemaVersion":"1.0","msg":"⑃ fork joined [groupId: fork-1, members: 2]"}
{"level":10,"code.namespace":"PaymentService","code.function":"charge","nt.depth":1,"nt.parameters":[{"name":"customerId","value":"\"C-1234\""},{"name":"amountCents","value":"7998"},{"name":"card","value":"[REDACTED]"}],"trace_id":"c4e1d0a7c4e1d0a7c4e1d0a7c4e1d0a7","nt.traceName":"solid wand romps","span_id":"0000000000000004","parent_span_id":"0000000000000001","nt.storyId":"OrderService.placeOrder","nt.chapterId":"OrderService.placeOrder","nt.entryType":"entry","nt.eventType":"method_enter","nt.schemaVersion":"1.0","msg":"→ PaymentService.charge"}
{"level":10,"nt.outcome":"returned","nt.depth":0,"trace_id":"c4e1d0a7c4e1d0a7c4e1d0a7c4e1d0a7","nt.traceName":"solid wand romps","span_id":"0000000000000004","parent_span_id":"0000000000000001","nt.storyId":"OrderService.placeOrder","nt.chapterId":"OrderService.placeOrder","nt.entryType":"entry","nt.eventType":"method_exit","nt.schemaVersion":"1.0","nt.returnValue":"\"PAY-C-1234-7998\"","msg":"← returned: \"PAY-C-1234-7998\""}
{"level":10,"code.namespace":"OrderRepository","code.function":"save","nt.depth":1,"nt.parameters":[{"name":"order","value":"{\"orderId\": \"ORD-C-1234-SKU-KB-2\", \"customerId\": \"C-1234\", \"sku\": \"SKU-KB\", \"quantity\": 2, \"amountCents\": 7998}"}],"trace_id":"c4e1d0a7c4e1d0a7c4e1d0a7c4e1d0a7","nt.traceName":"solid wand romps","span_id":"0000000000000005","parent_span_id":"0000000000000001","nt.storyId":"OrderService.placeOrder","nt.chapterId":"OrderService.placeOrder","nt.entryType":"entry","nt.eventType":"method_enter","nt.schemaVersion":"1.0","msg":"→ OrderRepository.save"}
{"level":10,"nt.outcome":"returned","nt.depth":0,"trace_id":"c4e1d0a7c4e1d0a7c4e1d0a7c4e1d0a7","nt.traceName":"solid wand romps","span_id":"0000000000000005","parent_span_id":"0000000000000001","nt.storyId":"OrderService.placeOrder","nt.chapterId":"OrderService.placeOrder","nt.entryType":"entry","nt.eventType":"method_exit","nt.schemaVersion":"1.0","nt.returnValue":null,"msg":"← returned: null"}
{"level":10,"nt.outcome":"returned","nt.depth":0,"trace_id":"c4e1d0a7c4e1d0a7c4e1d0a7c4e1d0a7","nt.traceName":"solid wand romps","span_id":"0000000000000001","nt.storyId":"OrderService.placeOrder","nt.chapterId":"OrderService.placeOrder","nt.entryType":"entry","nt.eventType":"method_exit","nt.schemaVersion":"1.0","nt.returnValue":"\"ORD-C-1234-SKU-KB-2\"","msg":"← returned: \"ORD-C-1234-SKU-KB-2\""}
```
<!-- /snippet -->

**The structural trace of that run**
(`narrativetrace-output/recipes/follow-a-flow-across-threads/checkout.nt`):

<!-- snippet: recipes/checkout/narrativetrace-output/recipes/follow-a-flow-across-threads/checkout.nt -->
```text
scenario: the background tasks stay in the customers trace

#1 - OrderService.placeOrder(customerId, sku, quantity, cardNumber) → value
  ~ fork [2]
    #1.1 - FraudCheckService.approve(customerId, amountCents) → value
    #1.2 - InventoryService.reserve(sku, quantity)
  #1.3 - PaymentService.charge(customerId, amountCents, card) → value
  #1.4 - OrderRepository.save(order)

```
<!-- /snippet -->

The Markdown artifact of the same run carries three things more — the fork
segment's join, its wall time, and a "sequential async" hint where the tasks
did not overlap — and is not embedded here because the numbers differ on every
run.

## How to read it

- **The handover is visible in the structure.** `~ fork [2]` in the `.nt` is
  the group: two members, joined, under `#1`. The log carries the group's own
  lifecycle too, not only the spans: a `⑂ fork group created` line for each
  member, naming the member's root as `span_id` and the launching span as
  `parent_span_id`, and one `⑃ fork joined` line with the member count, all
  three tagged with the same `nt.groupId` (the pino bridge writes them at the
  entry level, like the Java listener). The wall time of the join is in the
  Markdown artifact, not in the log line.
- **The children's lines carry the customer's trace id and name the launching
  span as their parent.** `InventoryService.reserve` and
  `FraudCheckService.approve` are written with
  `"trace_id":"c4e1d0a7c4e1d0a7c4e1d0a7c4e1d0a7"` — the same id as every line
  around them — and `"parent_span_id":"0000000000000001"`, which is the
  `span_id` of `OrderService.placeOrder`. (Span ids are random in a real run;
  the test numbers them so the log is reproducible, `support/stable-ids.ts` —
  never do that in your own project.) The assertion
  `assertTheChildrenCameHome` above states the same thing in code: each child's
  trace id is the root's, each child's parent is the root's span, and each is
  recorded as a `fork-join` member. That assertion is this page's proof.
- **Each child appears in the caller's tree, and twice in the log.** The tasks
  ran in their own forked contexts, and the group published them under the span
  that launched them when it joined: the child's own entry and return lines,
  written as it ran, and the group's `⑂ fork group created` line for it,
  written at the join; `#1.1` and `#1.2` in the `.nt` inside `~ fork [2]`. The `.nt` lists a fork's members in a fixed
  order of its own, not in the order they started, which is why
  `FraudCheckService.approve` precedes `InventoryService.reserve` there while
  the log shows `reserve` first.
- **The calls after the join belong to the caller.** `PaymentService.charge`
  and `OrderRepository.save` run in the launching scope after `await`, so they
  are `#1.3` and `#1.4` outside the fork — the shape of the code, read back as a
  tree.
- **How the second run differs.** Hand the same traced call to the worker with
  no group and the job runs in the worker's scope, which has no trace: its
  first traced call does what any first traced call does and starts one. The
  test asserts the two consequences — the trace id observed *on the worker* is
  not the caller's, and the caller's own captured trace contains no
  `InventoryService.reserve` at all. The work still happens, the stock is still
  reserved, the lines are still logged. They are simply somebody else's story,
  under an id nobody is searching for. That log is not embedded: a real run
  mints that id at random, and an id that differs on every run is the finding,
  not a block a page can hold.
- **Why the tasks here overlap only at an `await`.** The reserve is a plain
  call and the fraud check awaits one hop, so on one thread they interleave at
  that `await` and no further. That is a property of this scenario, chosen so
  one run's log is reproducible — not of the handover, which is the same code
  for tasks of any length.

## What is not captured

- **Work started without the handover starts a new trace.** That is the whole
  second half of this page: no group, no shared trace id. Nothing warns you,
  because from the library's point of view a traced call in a scope with no
  trace is an ordinary new trace.
- **A real `worker_threads` Worker is another isolate.** Nothing of a context
  crosses into it; only messages do. Carry the trace in the message —
  `traceparentHeaders(context)` gives the `traceparent` string — and adopt it
  on the other side exactly as the callee in
  [Follow one request across services](follow-one-request-across-services.md)
  does.
- **A framework that propagates the scope is covered only where its
  integration says so.** The Express and Hono middleware give a request its
  scope and the `AsyncLocalStorage` carries it through awaited code; outside
  what the [Framework Integration Guide](../framework-integration-guide.md)
  lists, assume the handover is yours to write.
- **`captureTrace()` is scope-bound.** It returns what the scope it is called
  from can report: called outside `context.run(...)` it reads the process-wide
  default scope and returns an empty tree, not an error. The test captures
  inside `run`, as a request handler does — which is why the group, not the
  query, is what brings the two scopes together.
- **Work that outlives the call is a different helper.** `FireAndForgetGroup`
  has no join by design — the launching method has already returned, so there
  is nobody left to wait. Each task is published when it settles.
- **Interleaving.** With real concurrency the children's lines arrive in
  whatever order the tasks settle, which is why a log is read by trace id and
  not by position. The trace artifacts are unaffected: parentage comes from the
  fork, not from the order lines were written.

**The skill for this:** `narrativetrace-verify` — "runs async" and "carries
state between calls" are two of the cases it exists for, and it reads the
structural trace against the intent before anything is called done.
