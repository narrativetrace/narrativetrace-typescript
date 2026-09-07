// SPDX-License-Identifier: BUSL-1.1
// Licensed under the Business Source License 1.1 (see LICENSE); Change Date: four years from publication; Change License: Apache-2.0
// Copyright (c) 2026 Empower Agile
export { createOtelEventConsumer, type OtelEventConsumerOptions } from "./otel-event-consumer.js";
export {
  buildEventAttributes,
  emitChildEvent,
  setConcurrencyAttributes,
  setNtSchemaAttributes,
  setOutcomeAttributes,
  setSpanAttributes,
  setTraceIdentityAttributes,
  setTraceLevelAttributes,
} from "./span-context-attribute-mapper.js";
export { TraceSpanExporter } from "./trace-span-exporter.js";
