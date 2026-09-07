// SPDX-License-Identifier: BUSL-1.1
// Licensed under the Business Source License 1.1 (see LICENSE); Change Date: four years from publication; Change License: Apache-2.0
// Copyright (c) 2026 Empower Agile
import { Writable } from "node:stream";
import { LogContext } from "@narrativetrace/observability";
import { afterEach, describe, expect, it } from "vitest";
import winston from "winston";
import { createWinstonFormat } from "../src/winston-format.js";

function createTestLogger(format: winston.Logform.Format) {
  const events: Record<string, unknown>[] = [];
  const transport = new winston.transports.Stream({
    stream: new Writable({
      write(chunk, _encoding, callback) {
        events.push(JSON.parse(chunk.toString()));
        callback();
      },
    }),
  });
  const logger = winston.createLogger({
    level: "debug",
    format: winston.format.combine(format, winston.format.json()),
    transports: [transport],
  });
  return { logger, events };
}

describe("createWinstonFormat", () => {
  afterEach(() => LogContext.reset());

  it("returns current LogContext values in log info", () => {
    LogContext.set("code.namespace", "OrderService");
    LogContext.set("nt.depth", 0);

    const { logger, events } = createTestLogger(createWinstonFormat());
    logger.info("test");

    expect(events[0]?.["code.namespace"]).toBe("OrderService");
    expect(events[0]?.["nt.depth"]).toBe(0);
  });

  it("returns unmodified info when no context is set", () => {
    const { logger, events } = createTestLogger(createWinstonFormat());
    logger.info("plain message");

    expect(events[0]?.message).toBe("plain message");
    expect(events[0]?.["code.namespace"]).toBeUndefined();
    expect(events[0]?.["code.function"]).toBeUndefined();
  });

  it("enriches winston log lines with LogContext values", () => {
    LogContext.set("code.namespace", "OrderService");
    LogContext.set("code.function", "placeOrder");

    const { logger, events } = createTestLogger(createWinstonFormat());
    logger.info("placing order");

    expect(events[0]?.["code.namespace"]).toBe("OrderService");
    expect(events[0]?.["code.function"]).toBe("placeOrder");
    expect(events[0]?.message).toBe("placing order");
  });
});
