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
import { context, trace } from "@opentelemetry/api";
import { InMemorySpanExporter, SimpleSpanProcessor } from "@opentelemetry/sdk-trace-base";
import { NodeTracerProvider } from "@opentelemetry/sdk-trace-node";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import {
  NarrativeTraceIdGenerator,
  offerIds,
  withdraw,
} from "../src/narrative-trace-id-generator.js";
import { createOtelEventConsumer } from "../src/otel-event-consumer.js";
import { TraceSpanExporter } from "../src/trace-span-exporter.js";

const traceId = "aaaabbbbccccddddeeee111122223333" as TraceId;
// The generator remembers handed-out ids for the life of the module, so every test takes its own range.
let base = 0;
const sid = (n: number) => (base + n + 1).toString(16).padStart(16, "0") as SpanId;

let provider: NodeTracerProvider | undefined;
beforeEach(() => {
  base += 100;
});

afterEach(async () => {
  await provider?.shutdown();
  provider = undefined;
  vi.restoreAllMocks();
  delete process.env.NARRATIVETRACE_OTEL_MIRROR_IDS;
});

function setup(generator: NarrativeTraceIdGenerator) {
  const exporter = new InMemorySpanExporter();
  provider = new NodeTracerProvider({
    idGenerator: generator,
    spanProcessors: [new SimpleSpanProcessor(exporter)],
  });
  provider.register();
  return { exporter, tracer: provider.getTracer("test") };
}

function enter(n: number, parent: number | null, name = "op") {
  return {
    type: "enter" as const,
    spanContext: spanContext(traceId, sid(n), parent === null ? null : sid(parent)),
    timestamp: performance.now(),
    signature: methodSignature("Svc", name, []),
  };
}

function exit(n: number, parent: number | null) {
  return {
    type: "exit" as const,
    spanContext: spanContext(traceId, sid(n), parent === null ? null : sid(parent)),
    timestamp: performance.now(),
    outcome: returned(null),
  };
}

describe("NarrativeTraceIdGenerator (B-173)", () => {
  test("the consumer's spans carry the NarrativeTrace span and trace ids", () => {
    const { exporter, tracer } = setup(new NarrativeTraceIdGenerator());
    const consumer = createOtelEventConsumer({ tracer });
    consumer(enter(1, null, "root"));
    consumer(enter(2, 1, "child"));
    consumer(exit(2, 1));
    consumer(exit(1, null));

    const spans = exporter.getFinishedSpans();
    const child = spans.find((x) => x.name === "Svc.child");
    const root = spans.find((x) => x.name === "Svc.root");
    expect(root?.spanContext().spanId).toBe(sid(1));
    expect(root?.spanContext().traceId).toBe(traceId);
    expect(child?.spanContext().spanId).toBe(sid(2));
    expect(child?.parentSpanId).toBe(sid(1));
  });

  test("mirrored: a late child past the memory parents exactly, with no synthetic mark", () => {
    const { exporter, tracer } = setup(new NarrativeTraceIdGenerator());
    const consumer = createOtelEventConsumer({ tracer, maxActiveSpans: 1 });
    consumer(enter(1, null, "parent"));
    consumer(exit(1, null));
    for (const n of [2, 3]) {
      consumer(enter(n, null, `newer${n}`));
      consumer(exit(n, null));
    }
    const stranger = tracer.startSpan("Unrelated.active");
    context.with(trace.setSpan(context.active(), stranger), () => consumer(enter(4, 1, "late")));
    consumer(exit(4, 1));

    const late = exporter.getFinishedSpans().find((x) => x.name === "Svc.late");
    expect(late?.parentSpanId).toBe(sid(1));
    expect(late?.attributes["narrative.parent.synthetic"]).toBeUndefined();
  });

  test("a span with no offer gets a random id", () => {
    const { exporter, tracer } = setup(new NarrativeTraceIdGenerator());
    tracer.startSpan("plain").end();
    const [span] = exporter.getFinishedSpans();
    expect(span?.spanContext().spanId).toMatch(/^[0-9a-f]{16}$/);
    expect(span?.spanContext().spanId).not.toBe("0000000000000000");
  });

  test("opt-out by option leaves the SDK's ids random and the finished-frame memory in force", () => {
    const { exporter, tracer } = setup(new NarrativeTraceIdGenerator({ enabled: false }));
    const consumer = createOtelEventConsumer({ tracer });
    consumer(enter(1, null, "parent"));
    consumer(exit(1, null));
    consumer(enter(2, 1, "late"));
    consumer(exit(2, 1));

    const spans = exporter.getFinishedSpans();
    const parent = spans.find((x) => x.name === "Svc.parent");
    const late = spans.find((x) => x.name === "Svc.late");
    expect(parent?.spanContext().spanId).not.toBe(sid(1));
    expect(late?.parentSpanId).toBe(parent?.spanContext().spanId);
  });

  test("opt-out by NARRATIVETRACE_OTEL_MIRROR_IDS=false", () => {
    process.env.NARRATIVETRACE_OTEL_MIRROR_IDS = "false";
    const { exporter, tracer } = setup(new NarrativeTraceIdGenerator());
    createOtelEventConsumer({ tracer })(enter(1, null));
    expect(exporter.getFinishedSpans().length + 0).toBe(0);
    const consumer = createOtelEventConsumer({ tracer });
    consumer(enter(5, null));
    consumer(exit(5, null));
    expect(exporter.getFinishedSpans()[0]?.spanContext().spanId).not.toBe(sid(5));
  });

  test("a span exported by both paths mirrors once and warns once about the double export", () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const { exporter, tracer } = setup(new NarrativeTraceIdGenerator());
    const consumer = createOtelEventConsumer({ tracer });
    consumer(enter(7, null, "twice"));
    consumer(exit(7, null));
    const node = {
      signature: methodSignature("Svc", "twice", []),
      outcome: returned(null),
      children: [],
      startTimeMs: performance.now(),
      durationMs: 1,
      spanContext: spanContext(traceId, sid(7), null),
    };
    new TraceSpanExporter(tracer).export([node as never]);
    new TraceSpanExporter(tracer).export([node as never]);

    const ids = exporter.getFinishedSpans().map((x) => x.spanContext().spanId);
    expect(ids.filter((id) => id === sid(7))).toHaveLength(1);
    expect(new Set(ids).size).toBe(ids.length);
    expect(warn).toHaveBeenCalledTimes(1);
    expect(String(warn.mock.calls[0]?.[0])).toContain("exported twice");
  });

  test("the handed-out memory is bounded: the oldest id is forgotten past its capacity", () => {
    const generator = new NarrativeTraceIdGenerator();
    const first = (4_000_000 + base).toString(16).padStart(16, "0");
    for (let i = 0; i < 4100; i++) {
      const offer = offerIds((4_000_000 + base + i).toString(16).padStart(16, "0"), null, "live");
      expect(generator.generateSpanId()).toBe(
        (4_000_000 + base + i).toString(16).padStart(16, "0"),
      );
      withdraw(offer);
    }
    const again = offerIds(first, null, "live");
    expect(generator.generateSpanId()).toBe(first);
    withdraw(again);
  });

  test("without an offer a trace id is random; a trace id requested before the span id is mirrored", () => {
    const generator = new NarrativeTraceIdGenerator();
    expect(generator.generateTraceId()).toMatch(/^[0-9a-f]{32}$/);
    const offer = offerIds(sid(1), traceId, "live");
    expect(generator.generateTraceId()).toBe(traceId);
    expect(generator.generateSpanId()).toBe(sid(1));
    expect(generator.generateSpanId()).toMatch(/^[0-9a-f]{16}$/);
    withdraw(offer);
  });

  test("a stale withdraw leaves a newer offer on the table", () => {
    const stale = offerIds(sid(1), null, "live");
    const current = offerIds(sid(2), null, "live");
    withdraw(stale);
    expect(new NarrativeTraceIdGenerator().generateSpanId()).toBe(sid(2));
    withdraw(current);
  });
});
