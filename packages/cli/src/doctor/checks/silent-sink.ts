// SPDX-License-Identifier: BUSL-1.1
// Licensed under the Business Source License 1.1 (see LICENSE); Change Date: four years from publication; Change License: Apache-2.0
// Copyright (c) 2026 Empower Agile
import { DOC } from "../doc-urls.js";
import { fail, pass } from "../finding.js";
import type { DoctorCheck } from "../types.js";

const ID = "trap.silent-sink";
const TRACE_OBJECT_CALL = /\btraceObject\s*\(/;
const SINK_SIGNAL =
  /\b(BufferedEventConsumer|captureTrace|registerConsumer|createNarrativeTest|narrativeTest)\b|@narrativetrace\/(vitest|pino|winston|opentelemetry|observability)\b/;

/**
 * The silent-sink trap: `traceObject()` proxies calls into events, but nothing narrates unless a
 * consumer/sink is attached (`BufferedEventConsumer`, `captureTrace()`, a log/OTel bridge, or the
 * vitest integration, which is its own sink). Wrapping without one of these is a project that looks
 * instrumented and narrates to nowhere.
 */
export const checkSilentSink: DoctorCheck = (snapshot) => {
  const contents = [...snapshot.sourceFiles.values()];
  if (!contents.some((content) => TRACE_OBJECT_CALL.test(content))) {
    return pass(ID, "traceObject() is not used — nothing to check", DOC.noTraceFilesWritten);
  }
  if (contents.some((content) => SINK_SIGNAL.test(content))) {
    return pass(
      ID,
      "traceObject() is used and a consumer/sink is attached",
      DOC.noTraceFilesWritten,
    );
  }
  return fail(
    ID,
    "traceObject() is used but no consumer or sink (BufferedEventConsumer, captureTrace(), a log/OTel bridge, or @narrativetrace/vitest) was found",
    "Attach a sink: pass a BufferedEventConsumer to your pipeline, call captureTrace() and do something with the tree, or wire a log/OTel bridge — otherwise every traced call narrates to nowhere.",
    DOC.noTraceFilesWritten,
  );
};
