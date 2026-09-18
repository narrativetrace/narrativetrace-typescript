// SPDX-License-Identifier: BUSL-1.1
// Licensed under the Business Source License 1.1 (see LICENSE); Change Date: four years from publication; Change License: Apache-2.0
// Copyright (c) 2026 Empower Agile
// config-shape-logger-threshold-does-not-affect-buffered-path: the FAQ/configuration-guide claim
// under "Two dials, two paths" is that the logger's own threshold gates only the synchronous
// path — the buffered path (captureTrace()) sees every captured event regardless of what the
// logger did with it. Proof: build a pino Logger at "fatal", its highest level, so every line
// NarrativeTrace writes (enter/return at "trace", the exception line at "warn") is below the bar
// and silently dropped by pino itself. Trace one call that throws, through that logger's
// DualPathPipeline consumer, and confirm captureTrace() still hands back a complete trace: the
// root call, with its "threw" outcome — not pruned, not missing, not incomplete.
import {
  BufferedEventConsumer,
  DualPathPipeline,
  NarrativeTraceConfig,
  SyncNarrativeContext,
} from "@narrativetrace/core";
import { createPinoEventConsumer } from "@narrativetrace/pino";
import { traceObject } from "@narrativetrace/proxy";
import pino from "pino";

class Svc {
  fail() {
    throw new Error("boom");
  }
}

const logger = pino({ level: "fatal" }); // silences every line NarrativeTrace writes (trace/warn)
const buffered = new BufferedEventConsumer();
const pipeline = new DualPathPipeline(createPinoEventConsumer(logger), buffered);
const context = new SyncNarrativeContext(new NarrativeTraceConfig("detail"), undefined, pipeline);

const traced = traceObject(new Svc(), context, { fail: [] });
try {
  traced.fail();
} catch {
  // expected — the traced call really does throw
}

const tree = context.captureTrace();
const root = tree.roots[0];
const complete = !tree.isEmpty && root !== undefined && root.outcome.kind === "threw";
console.log(complete ? "complete-trace-independent-of-logger" : "incomplete-or-missing-trace");
