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
import { createPinoEventConsumer } from "@narrativetrace/pino";
import type { Tracer } from "@opentelemetry/api";
import pino from "pino";

export function createTracedContext(
  tracer: Tracer,
  serviceIdentity?: ServiceIdentity,
): NarrativeContext {
  const pipeline = buildPipeline(tracer, serviceIdentity);
  return new AsyncNarrativeContext(new NarrativeTraceConfig("detail"), pipeline, serviceIdentity);
}

// Each service also streams its trace to a real logger — documentation/framework-integration-guide.md
// § 9 (Winston & Pino) — alongside the OTel spans it already exports; in a container, stdout is the
// realistic destination (the runtime/log aggregator collects it), one pino instance per service.
function buildPipeline(tracer: Tracer, serviceIdentity?: ServiceIdentity): DualPathPipeline {
  const otelConsumer = createOtelEventConsumer({ tracer });
  const enricherConsumer = createEnricherEventConsumer();
  const logger =
    serviceIdentity?.serviceName !== undefined
      ? pino({ name: serviceIdentity.serviceName })
      : pino();
  const pinoConsumer = createPinoEventConsumer(logger, {
    levels: { enter: "info", return: "info", exception: "error" },
  });
  const syncConsumer = (event: Parameters<typeof otelConsumer>[0]) => {
    otelConsumer(event);
    enricherConsumer(event);
    pinoConsumer(event);
  };
  return new DualPathPipeline(syncConsumer, new BufferedEventConsumer());
}
