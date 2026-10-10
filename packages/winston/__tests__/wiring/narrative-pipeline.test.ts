// SPDX-License-Identifier: BUSL-1.1
// Licensed under the Business Source License 1.1 (see LICENSE); Change Date: four years from publication; Change License: Apache-2.0
// Copyright (c) 2026 Empower Agile
import { Writable } from "node:stream";
import { NarrativeTraceConfig, SyncNarrativeContext } from "@narrativetrace/core";
import { describe, expect, test } from "vitest";
import winston from "winston";
import { narrativePipeline } from "./narrative-pipeline.js";

function loggerWritingTo(lines: Record<string, unknown>[]): winston.Logger {
  const stream = new Writable({
    write(chunk, _encoding, callback) {
      lines.push(JSON.parse(chunk.toString()));
      callback();
    },
  });
  const logger = winston.createLogger();
  logger.add(new winston.transports.Stream({ stream }));
  return logger;
}

describe("the winston row's wiring snippet", () => {
  test("writes every traced call to the project's own logger at its default level", () => {
    const lines: Record<string, unknown>[] = [];
    const logger = loggerWritingTo(lines);
    const context = new SyncNarrativeContext(
      new NarrativeTraceConfig(),
      undefined,
      narrativePipeline(logger),
    );

    context.enterMethod("OrderService", "placeOrder", []);
    context.exitMethodWithReturn("ORD-1");

    expect(lines).toHaveLength(2);
    expect(lines[0]?.message).toContain("OrderService.placeOrder");
    expect(context.captureTrace().roots[0]?.signature.methodName).toBe("placeOrder");
  });
});
