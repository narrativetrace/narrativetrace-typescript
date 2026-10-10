// SPDX-License-Identifier: BUSL-1.1
// Licensed under the Business Source License 1.1 (see LICENSE); Change Date: four years from publication; Change License: Apache-2.0
// Copyright (c) 2026 Empower Agile
import { BufferedEventConsumer, DualPathPipeline } from "@narrativetrace/core";
import { createOtelEventConsumer } from "@narrativetrace/opentelemetry";
import type { Tracer } from "@opentelemetry/api";

/**
 * Build it from this project's own tracer, trace.getTracer("orders"), and pass it wherever the
 * project creates its narrative context: new AsyncNarrativeContext(config, narrativePipeline(tracer)),
 * or a framework integration's pipeline option. Every traced call is then a span, and
 * captureTrace() still works.
 */
export function narrativePipeline(tracer: Tracer) {
  return new DualPathPipeline(createOtelEventConsumer({ tracer }), new BufferedEventConsumer());
}
