// SPDX-License-Identifier: BUSL-1.1
// Licensed under the Business Source License 1.1 (see LICENSE); Change Date: four years from publication; Change License: Apache-2.0
// Copyright (c) 2026 Empower Agile
import { LogContext } from "@narrativetrace/observability";
import pino from "pino";
import { afterEach, describe, expect, it } from "vitest";
import { createPinoMixin } from "../src/pino-mixin.js";

describe("createPinoMixin", () => {
  afterEach(() => LogContext.reset());

  it("returns current LogContext values", () => {
    LogContext.set("code.namespace", "OrderService");
    LogContext.set("nt.depth", 0);

    const mixin = createPinoMixin();
    const result = mixin();

    expect(result).toEqual({ "code.namespace": "OrderService", "nt.depth": 0 });
  });

  it("returns empty object when no context is set", () => {
    const mixin = createPinoMixin();
    expect(mixin()).toEqual({});
  });

  it("enriches pino log lines with LogContext values", () => {
    const events: Record<string, unknown>[] = [];
    const logger = pino(
      { level: "info", mixin: createPinoMixin() },
      { write: (msg: string) => events.push(JSON.parse(msg)) },
    );

    LogContext.set("code.namespace", "OrderService");
    LogContext.set("code.function", "placeOrder");
    logger.info("placing order");

    expect(events[0]?.["code.namespace"]).toBe("OrderService");
    expect(events[0]?.["code.function"]).toBe("placeOrder");
  });
});
