// SPDX-License-Identifier: BUSL-1.1
// Licensed under the Business Source License 1.1 (see LICENSE); Change Date: four years from publication; Change License: Apache-2.0
// Copyright (c) 2026 Empower Agile
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
