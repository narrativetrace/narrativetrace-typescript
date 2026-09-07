// SPDX-License-Identifier: BUSL-1.1
// Licensed under the Business Source License 1.1 (see LICENSE); Change Date: four years from publication; Change License: Apache-2.0
// Copyright (c) 2026 Empower Agile
import { Writable } from "node:stream";
import {
  BufferedEventConsumer,
  DualPathPipeline,
  NarrativeTraceConfig,
  parameterCapture,
  SyncNarrativeContext,
  type TracingLevel,
} from "@narrativetrace/core-node";
import { describe, expect, test } from "vitest";
import winston from "winston";
import { createWinstonEventConsumer } from "../src/winston-event-consumer.js";

/**
 * The two-gate architecture (Java ADR-008): the **capture** gate decides what enters the trace
 * tree, the **log** gate decides what reaches the logging backend. They are independent — either
 * can be loud while the other is quiet. These tests pin that independence by driving a real
 * context through a real pipeline into a real winston logger.
 */

function loggerAt(level: string) {
  const entries: Record<string, unknown>[] = [];
  const logger = winston.createLogger({
    level,
    format: winston.format.json(),
    transports: [
      new winston.transports.Stream({
        stream: new Writable({
          write(chunk, _encoding, callback) {
            entries.push(JSON.parse(chunk.toString()));
            callback();
          },
        }),
      }),
    ],
  });
  return { logger, entries };
}

/** Runs one traced call with both gates set, returning what each gate let through. */
function traceAt(
  captureLevel: TracingLevel,
  logLevel: string,
  levels?: { enter?: string; return?: string; exception?: string },
) {
  const { logger, entries } = loggerAt(logLevel);
  const consumer = createWinstonEventConsumer(logger, levels ? { levels } : {});
  const pipeline = new DualPathPipeline(consumer, new BufferedEventConsumer());
  const context = new SyncNarrativeContext(
    new NarrativeTraceConfig(captureLevel),
    undefined,
    pipeline,
  );

  context.enterMethod("OrderService", "placeOrder", [
    parameterCapture("customerId", '"C-42"', false),
  ]);
  context.exitMethodWithReturn('"OK"');

  return { captured: context.captureTrace(), logged: entries };
}

describe("two-gate level architecture", () => {
  test("capture stays full while the log gate is silent", () => {
    const { captured, logged } = traceAt("detail", "error");

    expect(captured.roots).toHaveLength(1);
    expect(captured.roots[0]?.signature.parameters[0]?.renderedValue).toBe('"C-42"');
    expect(logged).toHaveLength(0);
  });

  test("the log gate stays loud while capture is reduced to summary", () => {
    const { captured, logged } = traceAt("summary", "debug", {
      enter: "warn",
      return: "warn",
    });

    expect(captured.roots).toHaveLength(1);
    expect(logged.length).toBeGreaterThan(0);
    // SUMMARY suppresses values on the capture side; the log gate's verbosity cannot restore them.
    expect(captured.roots[0]?.signature.parameters[0]?.renderedValue).toBe("");
  });

  test("capture off closes both gates — nothing is captured and nothing is logged", () => {
    const { captured, logged } = traceAt("off", "debug", { enter: "error", return: "error" });

    expect(captured.roots).toHaveLength(0);
    expect(logged).toHaveLength(0);
  });

  test("raising the log gate does not change what capture retained", () => {
    const quiet = traceAt("detail", "error");
    const loud = traceAt("detail", "debug");

    expect(loud.captured.roots).toHaveLength(quiet.captured.roots.length);
    expect(loud.captured.roots[0]?.signature.parameters[0]?.renderedValue).toBe(
      quiet.captured.roots[0]?.signature.parameters[0]?.renderedValue,
    );
    expect(loud.logged.length).toBeGreaterThan(quiet.logged.length);
  });

  test("per-event log levels move independently of each other", () => {
    const { logged } = traceAt("detail", "warn", { enter: "warn", return: "debug" });

    // The enter line clears the `warn` backend threshold; the return line does not.
    expect(logged.map((e) => e.message)).toEqual(["→ OrderService.placeOrder"]);
  });
});
