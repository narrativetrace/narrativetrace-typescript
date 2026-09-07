// SPDX-License-Identifier: BUSL-1.1
// Licensed under the Business Source License 1.1 (see LICENSE); Change Date: four years from publication; Change License: Apache-2.0
// Copyright (c) 2026 Empower Agile
import { type Tracer, trace } from "@opentelemetry/api";
import { OTLPTraceExporter } from "@opentelemetry/exporter-trace-otlp-http";
import { registerInstrumentations } from "@opentelemetry/instrumentation";
import { HttpInstrumentation } from "@opentelemetry/instrumentation-http";
import { Resource } from "@opentelemetry/resources";
import { SimpleSpanProcessor } from "@opentelemetry/sdk-trace-base";
import { NodeTracerProvider } from "@opentelemetry/sdk-trace-node";
import { ATTR_SERVICE_NAME } from "@opentelemetry/semantic-conventions";

export function setupOtel(serviceName: string, otlpEndpoint?: string): Tracer {
  const resource = new Resource({ [ATTR_SERVICE_NAME]: serviceName });
  const exporter = new OTLPTraceExporter({
    url: otlpEndpoint ?? "http://localhost:4318/v1/traces",
  });
  const provider = new NodeTracerProvider({
    resource,
    spanProcessors: [new SimpleSpanProcessor(exporter)],
  });
  provider.register();
  registerInstrumentations({ instrumentations: [new HttpInstrumentation()] });
  return trace.getTracer(serviceName);
}
