// SPDX-License-Identifier: BUSL-1.1
// Licensed under the Business Source License 1.1 (see LICENSE); Change Date: four years from publication; Change License: Apache-2.0
// Copyright (c) 2026 Empower Agile
import {
  BufferedEventConsumer,
  DualPathPipeline,
  type EventPipeline,
  type NarrativeTraceConfig,
  type ServiceIdentity,
  SyncNarrativeContext,
} from "@narrativetrace/core";

/**
 * Capture-buffer size this seam recommends for a browser context: `2048` events.
 *
 * INTENT: unlike a server seam's shared, long-lived context, the browser's own usage pattern is a
 * *fresh* context per interaction — `examples/browser`'s demo builds one per button click, so
 * every click pays the ring's allocation cost, not just app boot. Measured per fresh consumer:
 * ~1.06 µs at 2048 slots versus ~99 µs at the runtime's `65536` default (V8 moves a backing store
 * over ~128 KB into large-object space at 16,384 pointers). 2048 stays generous for what one
 * interaction traces — a UI event handler's call graph, not a whole HTTP request — while keeping
 * repeated per-click construction cheap. Override with
 * {@link BrowserContextOptions.bufferCapacity} for a page that captures more per interaction.
 */
export const DEFAULT_BROWSER_BUFFER_CAPACITY = 2048;

export interface BrowserContextOptions {
  /** Ring size for the context's capture buffer, default {@link DEFAULT_BROWSER_BUFFER_CAPACITY}. */
  readonly bufferCapacity?: number;
  /** Full pipeline override; supplying this makes {@link bufferCapacity} moot. */
  readonly pipeline?: EventPipeline;
  readonly serviceIdentity?: ServiceIdentity;
}

/**
 * Builds a {@link SyncNarrativeContext} sized for this seam rather than the runtime's
 * process-lifetime default — the browser has no `AsyncLocalStorage`, so the sync context is the
 * browser's choice — a port-level design decision, not a per-seam one.
 *
 * INTENT: a recommended constructor for the common case, not a requirement — a page that already
 * builds its own sized context can keep doing so.
 */
export function createBrowserNarrativeContext(
  config: NarrativeTraceConfig,
  options: BrowserContextOptions = {},
): SyncNarrativeContext {
  const pipeline =
    options.pipeline ??
    new DualPathPipeline(
      null,
      new BufferedEventConsumer(options.bufferCapacity ?? DEFAULT_BROWSER_BUFFER_CAPACITY),
    );
  return new SyncNarrativeContext(config, undefined, pipeline, null, options.serviceIdentity);
}
