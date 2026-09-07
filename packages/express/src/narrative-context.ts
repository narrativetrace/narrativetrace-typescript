// SPDX-License-Identifier: BUSL-1.1
// Licensed under the Business Source License 1.1 (see LICENSE); Change Date: four years from publication; Change License: Apache-2.0
// Copyright (c) 2026 Empower Agile
import {
  BufferedEventConsumer,
  DualPathPipeline,
  type EventPipeline,
  type ServiceIdentity,
} from "@narrativetrace/core";
import { AsyncNarrativeContext, type NarrativeTraceConfig } from "@narrativetrace/core-node";

/**
 * Capture-buffer size this seam recommends for an Express app's context: `8192` events.
 *
 * INTENT: sized with the configuration guide's own rule (`peak events/s × worst tolerable drain
 * stall`) for the deployment target the whole buffered-consumer contract is calibrated against —
 * a single small VM, container or cloud function, not a fleet. At the default 100 ms drain
 * interval, 8192 slots absorb ~81,920 events/s before shedding — hundreds of concurrently in-flight
 * requests' worth of enter/exit pairs between drains, since a `narrativeTrace()` context is one
 * `DualPathPipeline` shared across every request via `AsyncLocalStorage`, not rebuilt per request.
 * It also stays under V8's ~128 KB large-object-space cliff (16,384 pointers) that the runtime's
 * `65536` default crosses — paying ~4 µs once at app boot instead of ~99 µs. Override with
 * {@link ExpressContextOptions.bufferCapacity} for a service that legitimately needs more.
 */
export const DEFAULT_EXPRESS_BUFFER_CAPACITY = 8192;

export interface ExpressContextOptions {
  /** Ring size for the context's capture buffer, default {@link DEFAULT_EXPRESS_BUFFER_CAPACITY}. */
  readonly bufferCapacity?: number;
  /** Full pipeline override; supplying this makes {@link bufferCapacity} moot. */
  readonly pipeline?: EventPipeline;
  readonly serviceIdentity?: ServiceIdentity;
}

/**
 * Builds the {@link AsyncNarrativeContext} an Express app passes to `narrativeTrace()`, sized for
 * this seam rather than the runtime's process-lifetime default.
 *
 * INTENT: `narrativeTrace()` accepts any pre-built `NarrativeContext` and never constructs one
 * itself — this is the recommended constructor for the common case, not a requirement; an app that
 * already builds its own sized context can keep doing so.
 */
export function createExpressNarrativeContext(
  config: NarrativeTraceConfig,
  options: ExpressContextOptions = {},
): AsyncNarrativeContext {
  const pipeline =
    options.pipeline ??
    new DualPathPipeline(
      null,
      new BufferedEventConsumer(options.bufferCapacity ?? DEFAULT_EXPRESS_BUFFER_CAPACITY),
    );
  return new AsyncNarrativeContext(config, pipeline, options.serviceIdentity);
}
