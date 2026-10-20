// SPDX-License-Identifier: BUSL-1.1
// Licensed under the Business Source License 1.1 (see LICENSE); Change Date: four years from publication; Change License: Apache-2.0
// Copyright (c) 2026 Empower Agile
// support/log-context.ts
import { mkdirSync, rmSync } from "node:fs";
import { dirname } from "node:path";
import {
  BufferedEventConsumer,
  DualPathPipeline,
  NarrativeTraceConfig,
  parseTraceparent,
  SyncNarrativeContext,
} from "@narrativetrace/core-node";
import { createPinoEventConsumer } from "@narrativetrace/pino";
import pino from "pino";

/** A fixed W3C traceparent, adopted so the embedded output names the same trace every run. */
const DEMO_TRACEPARENT = "00-c4e1d0a7c4e1d0a7c4e1d0a7c4e1d0a7-c4e1d0a7c4e1d0a7-01";

/** Any pino instance works; this one writes to a fresh file and drops the per-run fields. */
function loggerWritingTo(logFile: string): pino.Logger {
  mkdirSync(dirname(logFile), { recursive: true });
  rmSync(logFile, { force: true });
  const destination = pino.destination({ dest: logFile, sync: true });
  return pino({ level: "trace", base: null, timestamp: false }, destination);
}

/**
 * A context whose events reach the project's own pino logger (as well as the in-memory buffer
 * `captureTrace()` reads), for a trace id fixed by an adopted `traceparent`.
 */
export function contextLoggingTo(logFile: string): SyncNarrativeContext {
  const consumer = createPinoEventConsumer(loggerWritingTo(logFile));
  const pipeline = new DualPathPipeline(consumer, new BufferedEventConsumer());
  return new SyncNarrativeContext(
    new NarrativeTraceConfig(),
    undefined,
    pipeline,
    null,
    undefined,
    parseTraceparent(DEMO_TRACEPARENT)?.traceId,
  );
}
