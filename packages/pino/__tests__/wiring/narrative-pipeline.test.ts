// SPDX-License-Identifier: BUSL-1.1
// Licensed under the Business Source License 1.1 (see LICENSE); Change Date: four years from publication; Change License: Apache-2.0
// Copyright (c) 2026 Empower Agile
import { NarrativeTraceConfig, SyncNarrativeContext } from "@narrativetrace/core";
import pino from "pino";
import { describe, expect, test } from "vitest";
import { narrativePipeline } from "./narrative-pipeline.js";

describe("the pino row's wiring snippet", () => {
  test("writes every traced call to the project's own logger at its default level", () => {
    const lines: Record<string, unknown>[] = [];
    const logger = pino({}, { write: (chunk: string) => lines.push(JSON.parse(chunk)) });
    const context = new SyncNarrativeContext(
      new NarrativeTraceConfig(),
      undefined,
      narrativePipeline(logger),
    );

    context.enterMethod("OrderService", "placeOrder", []);
    context.exitMethodWithReturn("ORD-1");

    expect(lines).toHaveLength(2);
    expect(lines[0]?.msg).toContain("OrderService.placeOrder");
    expect(context.captureTrace().roots[0]?.signature.methodName).toBe("placeOrder");
  });
});
