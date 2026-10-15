// SPDX-License-Identifier: BUSL-1.1
// Licensed under the Business Source License 1.1 (see LICENSE); Change Date: four years from publication; Change License: Apache-2.0
// Copyright (c) 2026 Empower Agile
import {
  AsyncNarrativeContext,
  type NarrativeContext,
  NarrativeTraceConfig,
} from "@narrativetrace/core-node";

const SLOT = Symbol.for("narrativetrace.shared-context");
const slots = globalThis as { [SLOT]?: AsyncNarrativeContext };

function sharedContext(): AsyncNarrativeContext {
  slots[SLOT] ??= new AsyncNarrativeContext(new NarrativeTraceConfig());
  return slots[SLOT];
}

// Resolves the shared context on every call, so no bundle keeps a copy captured at import time.
export const context: NarrativeContext = new Proxy({} as NarrativeContext, {
  get(_target, property) {
    const shared = sharedContext();
    const value = Reflect.get(shared, property, shared);
    return typeof value === "function" ? value.bind(shared) : value;
  },
});
