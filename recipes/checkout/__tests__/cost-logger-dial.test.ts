// SPDX-License-Identifier: BUSL-1.1
// Licensed under the Business Source License 1.1 (see LICENSE); Change Date: four years from publication; Change License: Apache-2.0
// Copyright (c) 2026 Empower Agile
import { readFileSync } from "node:fs";
import { BasicTracerProvider } from "@opentelemetry/sdk-trace-base";
import { beforeEach, expect, it } from "vitest";
import { contextLoggingAndExporting } from "../support/observed-context.js";
import { recipeOutput } from "../support/recipe-runs.js";
import { useStableSpanIds } from "../support/stable-ids.js";
import { tracedCheckout } from "../support/wiring.js";

/**
 * Backs the claim in documentation/recipes/trace-in-production-without-the-cost.md that the tracing
 * level and the logger's level are two dials: a SUCCESSFUL checkout at `errors` keeps no trace, and
 * still offers every event to the live consumer, so what the logger writes is the logger's call.
 */
const LOG_FILE = recipeOutput("trace-in-production-without-the-cost", "errors-live.log");

beforeEach(useStableSpanIds);

it("a successful run at errors keeps no trace yet still reaches the live consumer", () => {
  const tracer = new BasicTracerProvider().getTracer("narrativetrace");
  const context = contextLoggingAndExporting(LOG_FILE, tracer, "errors");

  tracedCheckout(context).checkout.placeOrder("C-1234", "SKU-KB", 2, "4242424242424242");

  const lines = readFileSync(LOG_FILE, "utf-8").split("\n").filter(Boolean);
  expect(lines).toHaveLength(8);
  expect(context.captureTrace().roots).toEqual([]);
});
