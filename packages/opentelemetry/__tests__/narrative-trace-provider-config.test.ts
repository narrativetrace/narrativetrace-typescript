// SPDX-License-Identifier: BUSL-1.1
// Licensed under the Business Source License 1.1 (see LICENSE); Change Date: four years from publication; Change License: Apache-2.0
// Copyright (c) 2026 Empower Agile
import {
  methodSignature,
  returned,
  type SpanId,
  spanContext,
  type TraceId,
} from "@narrativetrace/core";
import { InMemorySpanExporter, SimpleSpanProcessor } from "@opentelemetry/sdk-trace-base";
import { NodeTracerProvider } from "@opentelemetry/sdk-trace-node";
import { afterEach, describe, expect, test, vi } from "vitest";
import { NarrativeTraceIdGenerator } from "../src/narrative-trace-id-generator.js";
import { narrativeTraceProviderConfig } from "../src/narrative-trace-provider-config.js";
import { createOtelEventConsumer } from "../src/otel-event-consumer.js";

const traceId = "ccccbbbbaaaaddddeeee111122223333" as TraceId;
// Ids are remembered for the life of the module; this file takes a range of its own.
const base = 5000;
const sid = (n: number) => (base + n).toString(16).padStart(16, "0") as SpanId;

let provider: NodeTracerProvider | undefined;
afterEach(async () => {
  await provider?.shutdown();
  provider = undefined;
  vi.restoreAllMocks();
  delete process.env.NARRATIVETRACE_OTEL_MIRROR_IDS;
});

function run(config: ReturnType<typeof narrativeTraceProviderConfig>, n: number) {
  const exporter = new InMemorySpanExporter();
  provider = new NodeTracerProvider({
    ...config,
    spanProcessors: [new SimpleSpanProcessor(exporter)],
  });
  const consumer = createOtelEventConsumer({ tracer: provider.getTracer("test") });
  const ctx = spanContext(traceId, sid(n), null);
  const timestamp = performance.now();
  consumer({
    type: "enter",
    spanContext: ctx,
    timestamp,
    signature: methodSignature("Svc", "op", []),
  });
  consumer({ type: "exit", spanContext: ctx, timestamp, outcome: returned(null) });
  return exporter.getFinishedSpans()[0];
}

describe("narrativeTraceProviderConfig", () => {
  test("a provider built from it starts spans with the NarrativeTrace ids", () => {
    const span = run(narrativeTraceProviderConfig(), 1);
    expect(span?.spanContext().spanId).toBe(sid(1));
    expect(span?.spanContext().traceId).toBe(traceId);
  });

  test("it keeps the caller's other options", () => {
    const config = narrativeTraceProviderConfig({ forceFlushTimeoutMillis: 123 });
    expect(config.forceFlushTimeoutMillis).toBe(123);
    expect(config.idGenerator).toBeInstanceOf(NarrativeTraceIdGenerator);
  });

  test("opt-out by option leaves ids random", () => {
    const span = run(narrativeTraceProviderConfig({ mirrorIds: false }), 2);
    expect(span?.spanContext().spanId).not.toBe(sid(2));
  });

  test("opt-out by NARRATIVETRACE_OTEL_MIRROR_IDS=false leaves ids random", () => {
    process.env.NARRATIVETRACE_OTEL_MIRROR_IDS = "false";
    const span = run(narrativeTraceProviderConfig(), 3);
    expect(span?.spanContext().spanId).not.toBe(sid(3));
  });

  test("a caller-supplied idGenerator is kept, with one warning", () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const own = { generateTraceId: () => "1".repeat(32), generateSpanId: () => "2".repeat(16) };
    const first = narrativeTraceProviderConfig({ idGenerator: own });
    const second = narrativeTraceProviderConfig({ idGenerator: own });
    expect(first.idGenerator).toBe(own);
    expect(second.idGenerator).toBe(own);
    expect(warn).toHaveBeenCalledTimes(1);
  });

  test("a caller-supplied NarrativeTraceIdGenerator is kept silently", () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const own = new NarrativeTraceIdGenerator();
    expect(narrativeTraceProviderConfig({ idGenerator: own }).idGenerator).toBe(own);
    expect(warn).not.toHaveBeenCalled();
  });
});
