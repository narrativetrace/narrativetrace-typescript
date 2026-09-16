// SPDX-License-Identifier: BUSL-1.1
// Licensed under the Business Source License 1.1 (see LICENSE); Change Date: four years from publication; Change License: Apache-2.0
// Copyright (c) 2026 Empower Agile
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
