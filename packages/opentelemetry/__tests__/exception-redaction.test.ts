// SPDX-License-Identifier: BUSL-1.1
// Licensed under the Business Source License 1.1 (see LICENSE); Change Date: four years from publication; Change License: Apache-2.0
// Copyright (c) 2026 Empower Agile
import { methodSignature, threw } from "@narrativetrace/core";
import { InMemorySpanExporter, SimpleSpanProcessor } from "@opentelemetry/sdk-trace-base";
import { NodeTracerProvider } from "@opentelemetry/sdk-trace-node";
import { afterEach, beforeEach, describe, expect, test } from "vitest";
import { buildEventAttributes, setOutcomeAttributes } from "../src/index.js";

// Public test card number, not a real credential; the redaction policy recognizes it by shape.
const PAN = "4111111111111111";

let exporter: InMemorySpanExporter;
let provider: NodeTracerProvider;

beforeEach(() => {
  exporter = new InMemorySpanExporter();
  provider = new NodeTracerProvider({ spanProcessors: [new SimpleSpanProcessor(exporter)] });
});

afterEach(async () => {
  await provider.shutdown();
});

/** Ends one span carrying the failure and returns what the SDK exported. */
function exportFailure(failure: unknown) {
  const span = provider.getTracer("test").startSpan("Pay.charge");
  setOutcomeAttributes(threw(failure), span);
  span.end();
  return exporter.getFinishedSpans()[0];
}

describe("OpenTelemetry exception message redaction (B-174)", () => {
  test("the ERROR status description is the marker, never the credential", () => {
    const span = exportFailure(new Error(PAN));
    expect(span.status.message).toBe("[REDACTED]");
  });

  test("the exception event carries type, the marker as message, and frames without the message", () => {
    const span = exportFailure(new Error(PAN));
    const event = span.events.find((e) => e.name === "exception");
    expect(event?.attributes?.["exception.type"]).toBe("Error");
    expect(event?.attributes?.["exception.message"]).toBe("[REDACTED]");
    const stacktrace = String(event?.attributes?.["exception.stacktrace"]);
    expect(stacktrace).not.toContain(PAN);
    expect(stacktrace).toMatch(/^Error\n\s+at /);
  });

  test("a cause's message is redacted in the stacktrace too", () => {
    const span = exportFailure(new Error("outer", { cause: new Error(PAN) }));
    const stacktrace = String(
      span.events.find((e) => e.name === "exception")?.attributes?.["exception.stacktrace"],
    );
    expect(stacktrace).not.toContain(PAN);
    expect(stacktrace).toContain("Caused by: Error: [REDACTED]");
  });

  test("a thrown non-Error value is typed by typeof and its text is filtered", () => {
    const span = exportFailure(PAN);
    const event = span.events.find((e) => e.name === "exception");
    expect(event?.attributes?.["exception.type"]).toBe("string");
    expect(event?.attributes?.["exception.message"]).toBe("[REDACTED]");
    expect(JSON.stringify(event?.attributes)).not.toContain(PAN);
  });
});

describe("OpenTelemetry exception event over hostile errors (B-174)", () => {
  function stacktraceOf(failure: unknown): string {
    const span = exportFailure(failure);
    const event = span.events.find((e) => e.name === "exception");
    return String(event?.attributes?.["exception.stacktrace"]);
  }

  test("a cyclic cause chain is cut at the first repeat", () => {
    const a = new Error("a");
    const b = new Error("b", { cause: a });
    Object.defineProperty(a, "cause", { value: b });
    expect(stacktraceOf(a).match(/Caused by/g)).toHaveLength(1);
  });

  test("a cause getter that throws ends the chain instead of failing the export", () => {
    const failure = new Error("outer");
    Object.defineProperty(failure, "cause", {
      get() {
        throw new Error("no");
      },
    });
    expect(stacktraceOf(failure)).toMatch(/^Error\n\s+at /);
  });

  test("a stack getter that throws yields no frames", () => {
    const failure = new Error("outer");
    Object.defineProperty(failure, "stack", {
      get() {
        throw new Error("no");
      },
    });
    expect(stacktraceOf(failure)).toBe("Error");
  });

  test("a missing stack yields no frames", () => {
    const failure = new Error("outer");
    Object.defineProperty(failure, "stack", { value: undefined });
    expect(stacktraceOf(failure)).toBe("Error");
  });

  test("an empty message still yields the frames", () => {
    expect(stacktraceOf(new Error(""))).toMatch(/^Error\n\s+at /);
  });

  test("frame-looking lines inside a message are never mistaken for frames", () => {
    const failure = new Error(`first\n    at ${PAN}`);
    expect(stacktraceOf(failure)).not.toContain(PAN);
  });

  test("a stack that does not contain the message falls back to its own frame lines", () => {
    const failure = new Error("outer");
    Object.defineProperty(failure, "stack", { value: "Error: other\n    at frame (file.js:1:1)" });
    expect(stacktraceOf(failure)).toBe("Error\n    at frame (file.js:1:1)");
  });
});

describe("OpenTelemetry child-completion event redaction (B-174)", () => {
  test("a child's error outcome attribute is the marker, never the credential", () => {
    const attrs = buildEventAttributes(methodSignature("Pay", "charge", []), threw(new Error(PAN)));
    expect(attrs["narrative.outcome"]).toBe("error: [REDACTED]");
  });
});
