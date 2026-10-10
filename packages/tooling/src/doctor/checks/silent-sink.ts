// SPDX-License-Identifier: BUSL-1.1
// Licensed under the Business Source License 1.1 (see LICENSE); Change Date: four years from publication; Change License: Apache-2.0
// Copyright (c) 2026 Empower Agile
import {
  declaredPackages,
  installLine,
  isDetected,
  narrativeTraceVersionOf,
} from "../../frameworks/framework-detection.js";
import type { FrameworkRow, IntegrationModule } from "../../frameworks/framework-row.js";
import { frameworkRowById } from "../../frameworks/framework-table.js";
import { withoutComments } from "../../frameworks/source-text.js";
import { type SnippetWiring, wiringFix } from "../../frameworks/wiring-fix.js";
import { DOC } from "../doc-urls.js";
import { fail, pass } from "../finding.js";
import type { DoctorCheck, DoctorSnapshot } from "../types.js";

const ID = "trap.silent-sink";
const TRACE_OBJECT_CALL = /\btraceObject\s*\(/;
const SINK_SIGNAL =
  /\b(BufferedEventConsumer|captureTrace|registerConsumer|createNarrativeTest|narrativeTest)\b|@narrativetrace\/(vitest|pino|winston|opentelemetry|observability)\b/;

/**
 * The framework integrations' own hand-over points: each receives the captured tree, so a project
 * whose only sink is one of them is not silent. `onRequestComplete` is NestJS's (its completion
 * carries the `tree`; Express's and Hono's need `captureTrace()`, already a signal above),
 * `onTraceCapture`/`TraceCaptureService` Angular's, `useTraceCapture`/`useNavigationCapture` React's.
 * A bare `AutoProxyModule.forRoot()` names none of them, and stays a fail: nothing drains it.
 */
const FRAMEWORK_SINK_SIGNAL =
  /\b(onRequestComplete|onTraceCapture|TraceCaptureService|useTraceCapture|useNavigationCapture)\b/;

function attachesASink(content: string): boolean {
  return SINK_SIGNAL.test(content) || FRAMEWORK_SINK_SIGNAL.test(content);
}

/**
 * The silent-sink trap: `traceObject()` proxies calls into events, but nothing narrates unless a
 * consumer/sink is attached (`BufferedEventConsumer`, `captureTrace()`, a log/OTel bridge, or the
 * vitest integration, which is its own sink — or a framework integration's own completion hook).
 * Wrapping without one of these is a project that looks instrumented and narrates to nowhere.
 * Both signals are read from code, comments removed: a commented-out call is neither a use nor a
 * sink.
 */
export const checkSilentSink: DoctorCheck = (snapshot) => {
  const contents = [...snapshot.sourceFiles.values()].map(withoutComments);
  if (!contents.some((content) => TRACE_OBJECT_CALL.test(content))) {
    return pass(ID, "traceObject() is not used — nothing to check", DOC.noTraceFilesWritten);
  }
  if (contents.some(attachesASink)) {
    return pass(
      ID,
      "traceObject() is used and a consumer/sink is attached",
      DOC.noTraceFilesWritten,
    );
  }
  return fail(
    ID,
    "traceObject() is used but no consumer or sink (BufferedEventConsumer, captureTrace(), a log/OTel bridge, or @narrativetrace/vitest) was found",
    `Attach a sink: pass a BufferedEventConsumer to your pipeline, call captureTrace() and do something with the tree, or wire a log/OTel bridge — otherwise every traced call narrates to nowhere. ${loggerAdvice(snapshot)}`,
    DOC.noTraceFilesWritten,
  );
};

function tableRow(id: string): FrameworkRow {
  return frameworkRowById(id) as FrameworkRow;
}

/** The default-logger row: it ships pino and quotes pino's wiring (pinned by the table's tests). */
const DEFAULT_LOGGER = tableRow("default-logger") as FrameworkRow & {
  readonly module: IntegrationModule;
  readonly wiring: SnippetWiring;
};

/** The logger rows, in table order — the first one a project declares is the bridge to wire. */
const LOGGER_ROWS = ["pino", "winston", "opentelemetry"].map(tableRow);

/**
 * Which log bridge the fix names: the declared logger's own `config.<lib>-consumer` check, or —
 * with no logger declared at all — the framework table's default-logger row, quoted whole (install
 * line plus wiring), so the fix is complete on its own and is the fix this check accepts.
 */
function loggerAdvice(snapshot: DoctorSnapshot): string {
  const declared = declaredPackages(snapshot.manifests.values());
  const logger = LOGGER_ROWS.find((row) => isDetected(row, declared));
  if (logger) {
    const name = logger.marker.packages.find((packageName) => declared.has(packageName));
    return `This project declares ${name}: apply ${logger.check.id}'s fix.`;
  }
  const version = narrativeTraceVersionOf(snapshot.installedPackages);
  const install = installLine(snapshot.packageManager, DEFAULT_LOGGER.module, version);
  return `This project declares no logger, so the default is pino: ${install}, then ${wiringFix(DEFAULT_LOGGER.wiring)}`;
}
