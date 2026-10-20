// SPDX-License-Identifier: BUSL-1.1
// Licensed under the Business Source License 1.1 (see LICENSE); Change Date: four years from publication; Change License: Apache-2.0
// Copyright (c) 2026 Empower Agile
// support/service-log.ts
import { mkdirSync, rmSync } from "node:fs";
import { dirname } from "node:path";
import {
  AsyncNarrativeContext,
  BufferedEventConsumer,
  DualPathPipeline,
  NarrativeTraceConfig,
} from "@narrativetrace/core-node";
import { createPinoEventConsumer } from "@narrativetrace/pino";
import pino from "pino";

/**
 * Whose lines these are (absent: no `service.name`, for a project with one service), and whether
 * this service starts the file (the default) or joins one already started.
 */
export interface ServiceLogOptions {
  readonly serviceName?: string;
  readonly fresh?: boolean;
}

function loggerAppendingTo(logFile: string, fresh: boolean): pino.Logger {
  mkdirSync(dirname(logFile), { recursive: true });
  if (fresh) rmSync(logFile, { force: true });
  const destination = pino.destination({ dest: logFile, sync: true });
  return pino({ level: "trace", base: null, timestamp: false }, destination);
}

/**
 * The context of one service among several: its events reach `logFile` through the project's own
 * pino logger and carry `service.name`. Two services pointed at one file write one interleaved
 * log, and the trace id on a line says which request it belongs to.
 *
 * @llmNote The context is asynchronous (`AsyncNarrativeContext`) because the services here answer
 * over HTTP: `run()` gives each request a scope of its own and `tracedFetch` reads the span that is
 * open in it.
 */
export function serviceContextLoggingTo(
  logFile: string,
  options: ServiceLogOptions = {},
): AsyncNarrativeContext {
  const consumer = createPinoEventConsumer(loggerAppendingTo(logFile, options.fresh ?? true));
  const pipeline = new DualPathPipeline(consumer, new BufferedEventConsumer());
  const identity =
    options.serviceName === undefined ? undefined : { serviceName: options.serviceName };
  return new AsyncNarrativeContext(new NarrativeTraceConfig(), pipeline, identity);
}
