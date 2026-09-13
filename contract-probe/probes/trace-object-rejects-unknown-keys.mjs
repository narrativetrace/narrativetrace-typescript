// SPDX-License-Identifier: BUSL-1.1
// Licensed under the Business Source License 1.1 (see LICENSE); Change Date: four years from publication; Change License: Apache-2.0
// Copyright (c) 2026 Empower Agile
// config-shape-trace-object-rejects-unknown-keys: an unrecognised ProxyOptions key must throw,
// never silently no-op.
import { NarrativeTraceConfig, SyncNarrativeContext } from "@narrativetrace/core";
import { traceObject } from "@narrativetrace/proxy";

class Svc {
  ping() {
    return "pong";
  }
}

const context = new SyncNarrativeContext(new NarrativeTraceConfig());
let threw = false;
try {
  traceObject(new Svc(), context, { ping: [] }, { notARealOption: true });
} catch {
  threw = true;
}
console.log(threw ? "throws" : "no-throw");
