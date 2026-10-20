// SPDX-License-Identifier: BUSL-1.1
// Licensed under the Business Source License 1.1 (see LICENSE); Change Date: four years from publication; Change License: Apache-2.0
// Copyright (c) 2026 Empower Agile
// support/observed-context.ts
import { mkdirSync, rmSync } from "node:fs";
import { dirname } from "node:path";
import {
  BufferedEventConsumer,
  DualPathPipeline,
  type EventConsumer,
  NarrativeTraceConfig,
  parseTraceparent,
  SyncNarrativeContext,
  type TracingLevel,
} from "@narrativetrace/core-node";
import { createOtelEventConsumer } from "@narrativetrace/opentelemetry";
import { createPinoEventConsumer } from "@narrativetrace/pino";
import type { Tracer } from "@opentelemetry/api";
import pino from "pino";

/** A fixed W3C traceparent, adopted so the embedded output names the same trace every run. */
const DEMO_TRACEPARENT = "00-c4e1d0a7c4e1d0a7c4e1d0a7c4e1d0a7-c4e1d0a7c4e1d0a7-01";

function loggerWritingTo(logFile: string): pino.Logger {
  mkdirSync(dirname(logFile), { recursive: true });
  rmSync(logFile, { force: true });
  const destination = pino.destination({ dest: logFile, sync: true });
  return pino({ level: "trace", base: null, timestamp: false }, destination);
}

/** One consumer that hands every event to each of `consumers`, in order. */
function allOf(...consumers: EventConsumer[]): EventConsumer {
  return (event) => {
    for (const consume of consumers) consume(event);
  };
}

/**
 * A context whose events go to two places at once: the project's own pino logger, and the project's
 * own OpenTelemetry tracer as spans.
 *
 * INTENT: the pipeline is the only new idea. The narration consumer you already have and the OTel
 * consumer sit side by side on the live path; the buffered path beside them is untouched, so
 * `captureTrace()` still works. Nothing is taken away from the logger to feed the exporter.
 *
 * @llmNote The OTel consumer is composed into the pipeline explicitly, with the tracer handed in,
 * rather than found through a global SDK: an in-memory exporter cannot be discovered, and a global
 * provider leaks from one test into the next.
 */
export function contextLoggingAndExporting(
  logFile: string,
  tracer: Tracer,
  level: TracingLevel = "detail",
): SyncNarrativeContext {
  const narration = createPinoEventConsumer(loggerWritingTo(logFile));
  const spans = createOtelEventConsumer({ tracer });
  const pipeline = new DualPathPipeline(allOf(narration, spans), new BufferedEventConsumer());
  return new SyncNarrativeContext(
    new NarrativeTraceConfig(level),
    undefined,
    pipeline,
    null,
    undefined,
    parseTraceparent(DEMO_TRACEPARENT)?.traceId,
  );
}
