// SPDX-License-Identifier: BUSL-1.1
// Licensed under the Business Source License 1.1 (see LICENSE); Change Date: four years from publication; Change License: Apache-2.0
// Copyright (c) 2026 Empower Agile
// probed-dual-path-pipeline-default-consumer: a DualPathPipeline built with a null buffered
// consumer must still capture — the buffered path is never silently absent.
import { DualPathPipeline, NarrativeTraceConfig, SyncNarrativeContext } from "@narrativetrace/core";
import { traceObject } from "@narrativetrace/proxy";

class Svc {
  ping() {
    return "pong";
  }
}

const context = new SyncNarrativeContext(
  new NarrativeTraceConfig(),
  undefined,
  new DualPathPipeline(null, null),
);
traceObject(new Svc(), context).ping();
const tree = context.captureTrace();
console.log(tree.roots.length > 0 ? "captures" : "empty");
