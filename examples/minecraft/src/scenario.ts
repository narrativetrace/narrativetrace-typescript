// SPDX-License-Identifier: BUSL-1.1
// Licensed under the Business Source License 1.1 (see LICENSE); Change Date: four years from publication; Change License: Apache-2.0
// Copyright (c) 2026 Empower Agile
import type { EventConsumer, NarrativeContext, TraceTree } from "@narrativetrace/core-node";
import {
  AsyncNarrativeContext,
  BufferedEventConsumer,
  DualPathPipeline,
  NarrativeTraceConfig,
} from "@narrativetrace/core-node";

/**
 * What a demo scenario is handed: the context to trace on, a sink for its sections, and a hook
 * that records each captured tree under its title (the launcher's `--lang` mode translates them).
 */
export type { NarrativeContext };

export interface ScenarioContext {
  readonly context: NarrativeContext;
  readonly print: (text: string) => void;
  readonly capture: (title: string, tree: TraceTree) => void;
}

/**
 * One named, self-describing demo scenario. `wiring` explains how this scenario's trace is
 * configured — the note the launcher prints under the title before the trace scrolls by.
 */
export interface Scenario {
  readonly title: string;
  readonly wiring: string;
  readonly run: (ctx: ScenarioContext) => Promise<void>;
}

/**
 * The example's tracing context: a `DualPathPipeline` whose inline path is the optional live
 * listener (the launcher's `→ ← !!` stream) and whose buffered path feeds `captureTrace()`.
 */
export function createDemoContext(listener: EventConsumer | null = null): NarrativeContext {
  const pipeline = new DualPathPipeline(listener, new BufferedEventConsumer());
  return new AsyncNarrativeContext(new NarrativeTraceConfig("detail"), pipeline);
}
