// SPDX-License-Identifier: BUSL-1.1
// Licensed under the Business Source License 1.1 (see LICENSE); Change Date: four years from publication; Change License: Apache-2.0
// Copyright (c) 2026 Empower Agile
import type { NarrativeContext, ServiceIdentity } from "@narrativetrace/core";
import {
  AsyncNarrativeContext,
  BufferedEventConsumer,
  DualPathPipeline,
  NarrativeTraceConfig,
} from "@narrativetrace/core-node";
import { createEnricherEventConsumer } from "@narrativetrace/observability";
import { createOtelEventConsumer } from "@narrativetrace/opentelemetry";
import type { Tracer } from "@opentelemetry/api";

export function createTracedContext(
  tracer: Tracer,
  serviceIdentity?: ServiceIdentity,
): NarrativeContext {
  const pipeline = buildPipeline(tracer);
  return new AsyncNarrativeContext(new NarrativeTraceConfig("detail"), pipeline, serviceIdentity);
}

function buildPipeline(tracer: Tracer): DualPathPipeline {
  const otelConsumer = createOtelEventConsumer({ tracer });
  const enricherConsumer = createEnricherEventConsumer();
  const syncConsumer = (event: Parameters<typeof otelConsumer>[0]) => {
    otelConsumer(event);
    enricherConsumer(event);
  };
  return new DualPathPipeline(syncConsumer, new BufferedEventConsumer());
}
