// SPDX-License-Identifier: BUSL-1.1
// Licensed under the Business Source License 1.1 (see LICENSE); Change Date: four years from publication; Change License: Apache-2.0
// Copyright (c) 2026 Empower Agile
// index-with-logger.js
import {
  NarrativeTraceConfig,
  SyncNarrativeContext,
  DualPathPipeline,
  BufferedEventConsumer,
  parseTraceparent,
  renderMarkdownBody,
} from "@narrativetrace/core-node";
import { traceObject } from "@narrativetrace/proxy";
import { createPinoEventConsumer } from "@narrativetrace/pino";
import pino from "pino";

class OrderService {
  placeOrder(customerId, productId, quantity) {
    return `ORD-${customerId}-${productId}-${quantity}`;
  }
}

// A documented constant for THIS example only — never the library default, which always
// generates a random trace id — so the "nt.traceName"/"trace_id" fields below stay the same
// phrase every time this page's output is regenerated (2026-09-13 ruling, item 5).
const FIXED_TRACEPARENT = "00-a1b2c3d4a1b2c3d4a1b2c3d4a1b2c3d4-a1b2c3d4a1b2c3d4-01";
const fixedTraceId = parseTraceparent(FIXED_TRACEPARENT);

const logger = pino();
const pinoConsumer = createPinoEventConsumer(logger, { levels: { enter: "info", return: "info" } });
const pipeline = new DualPathPipeline(pinoConsumer, new BufferedEventConsumer());
// The 6th constructor argument seeds the trace id an inbound "traceparent" header would carry —
// see the Framework Integration Guide for how a real server reads it from the request instead of
// a constant. No runName here at all: a plain script run belongs to no test-suite execution, so
// there is no RunIdentity to pass createPinoEventConsumer — nt.runName is simply absent below.
const context = new SyncNarrativeContext(
  new NarrativeTraceConfig(),
  undefined,
  pipeline,
  null,
  undefined,
  fixedTraceId,
);
const service = traceObject(new OrderService(), context, {
  placeOrder: ["customerId", "productId", "quantity"],
});

service.placeOrder("C1", "P1", 2);
console.log(renderMarkdownBody(context.captureTrace()));
