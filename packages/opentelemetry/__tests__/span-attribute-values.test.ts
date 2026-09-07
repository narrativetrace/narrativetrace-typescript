// SPDX-License-Identifier: BUSL-1.1
// Licensed under the Business Source License 1.1 (see LICENSE); Change Date: four years from publication; Change License: Apache-2.0
// Copyright (c) 2026 Empower Agile
import type { RenderedValue, SpanId, TraceId } from "@narrativetrace/core";
import {
  concurrencyInfo,
  incomplete,
  methodSignature,
  parameterCapture,
  returned,
  spanContext,
  threw,
  traceNode,
} from "@narrativetrace/core";
import type { Attributes, AttributeValue, Span } from "@opentelemetry/api";
import { SpanStatusCode } from "@opentelemetry/api";
import { describe, expect, test } from "vitest";
import {
  buildEventAttributes,
  emitChildEvent,
  setConcurrencyAttributes,
  setOutcomeAttributes,
  setSpanAttributes,
} from "../src/index.js";

const traceId = "aaaabbbbccccddddeeee111122223333" as TraceId;
const sid = (n: number) => n.toString(16).padStart(16, "0") as SpanId;

interface RecordedEvent {
  name: string;
  attrs?: Attributes;
  time?: number;
}

/**
 * Minimal Span recorder. The mapper's contract is *which* attribute keys and values it emits, so
 * capturing the calls is both sufficient and far more precise than reading them back off a real
 * SDK span (which coerces and drops).
 */
function recorder() {
  const attributes: Record<string, AttributeValue> = {};
  const events: RecordedEvent[] = [];
  const exceptions: unknown[] = [];
  let status: { code: SpanStatusCode; message?: string } | undefined;
  const span = {
    setAttribute(key: string, value: AttributeValue) {
      attributes[key] = value;
      return span;
    },
    addEvent(name: string, attrs?: Attributes, time?: number) {
      events.push({ name, attrs, time });
      return span;
    },
    setStatus(s: { code: SpanStatusCode; message?: string }) {
      status = s;
      return span;
    },
    recordException(e: unknown) {
      exceptions.push(e);
      return span;
    },
  } as unknown as Span;
  return { span, attributes, events, exceptions, status: () => status };
}

/** Runs one parameter through setSpanAttributes and returns only the param attributes. */
function paramAttrs(renderedValue: string, structured?: RenderedValue, redacted = false) {
  const rec = recorder();
  const sig = methodSignature("Svc", "op", [
    parameterCapture("p", renderedValue, redacted, structured),
  ]);
  setSpanAttributes(sig, rec.span);
  const { "code.namespace": _ns, "code.function": _fn, ...rest } = rec.attributes;
  return rest;
}

describe("setOutcomeAttributes", () => {
  test("records a returned value as narrative.outcome", () => {
    const rec = recorder();
    setOutcomeAttributes(returned('"OK"'), rec.span);
    expect(rec.attributes["narrative.outcome"]).toBe('"OK"');
  });

  test("omits narrative.outcome for a void return rather than writing null", () => {
    const rec = recorder();
    setOutcomeAttributes(returned(null), rec.span);
    expect(rec.attributes).not.toHaveProperty("narrative.outcome");
  });

  test("marks an in-flight span rather than leaving it unlabelled", () => {
    const rec = recorder();
    setOutcomeAttributes(incomplete(), rec.span);
    expect(rec.attributes["narrative.outcome"]).toBe("in-flight");
  });

  test("records an Error as an exception plus ERROR status carrying its message", () => {
    const rec = recorder();
    const err = new Error("insufficient funds");
    setOutcomeAttributes(threw(err), rec.span);
    expect(rec.exceptions).toEqual([err]);
    expect(rec.status()).toEqual({ code: SpanStatusCode.ERROR, message: "insufficient funds" });
  });

  test("stringifies a non-Error throw instead of passing it through as an object", () => {
    const rec = recorder();
    setOutcomeAttributes(threw("boom" as unknown as Error), rec.span);
    expect(rec.exceptions).toEqual(["boom"]);
    expect(rec.status()).toEqual({ code: SpanStatusCode.ERROR, message: "boom" });
  });
});

describe("setConcurrencyAttributes", () => {
  test("writes group id, kind and task label", () => {
    const rec = recorder();
    setConcurrencyAttributes(concurrencyInfo("g-1", "task-a", "fork-join"), rec.span);
    expect(rec.attributes).toEqual({
      "narrative.concurrency.groupId": "g-1",
      "narrative.concurrency.kind": "fork-join",
      "narrative.concurrency.taskLabel": "task-a",
    });
  });

  test("writes nothing for a span that is not part of a group", () => {
    const rec = recorder();
    setConcurrencyAttributes(undefined, rec.span);
    expect(rec.attributes).toEqual({});
  });
});

describe("buildEventAttributes", () => {
  test("carries typed params and the returned value", () => {
    const sig = methodSignature("Svc", "op", [parameterCapture("qty", "3", false)]);
    expect(buildEventAttributes(sig, returned('"OK"'))).toEqual({
      "narrative.param.qty": 3,
      "narrative.outcome": '"OK"',
    });
  });

  test("renders a throw as an error-prefixed outcome", () => {
    const sig = methodSignature("Svc", "op", []);
    expect(buildEventAttributes(sig, threw(new Error("nope")))).toEqual({
      "narrative.outcome": "error: nope",
    });
  });

  test("omits the outcome for an in-flight child", () => {
    const sig = methodSignature("Svc", "op", []);
    expect(buildEventAttributes(sig, incomplete())).toEqual({});
  });

  test("omits the outcome for a void return", () => {
    const sig = methodSignature("Svc", "op", []);
    expect(buildEventAttributes(sig, returned(null))).toEqual({});
  });
});

describe("emitChildEvent", () => {
  test("names the event Class.method and anchors it to the child's end time", () => {
    const rec = recorder();
    const child = traceNode(
      methodSignature("Repo", "save", []),
      returned('"ok"'),
      [],
      25,
      1000,
      undefined,
      spanContext(traceId, sid(1), sid(0)),
    );

    emitChildEvent(rec.span, child);

    expect(rec.events).toHaveLength(1);
    expect(rec.events[0]?.name).toBe("Repo.save");
    expect(rec.events[0]?.time).toBe(1025);
    expect(rec.events[0]?.attrs).toEqual({ "narrative.outcome": '"ok"' });
  });
});

describe("parameter attributes", () => {
  test("skips a redacted parameter entirely, value and all", () => {
    expect(paramAttrs("secret-token", undefined, true)).toEqual({});
  });

  test("skips a parameter with no rendered value", () => {
    expect(paramAttrs("")).toEqual({});
  });

  describe("type inference from the rendered string", () => {
    test.each([
      ["true", true],
      ["false", false],
      ["42", 42],
      ["-7", -7],
      ["3.5", 3.5],
      ['"hello"', "hello"],
      ["plain text", "plain text"],
      ['"', '"'],
      ["Infinity", "Infinity"],
      ["NaN", "NaN"],
      ["  ", "  "],
    ])("maps %j to %j", (rendered, expected) => {
      expect(paramAttrs(rendered)["narrative.param.p"]).toBe(expected);
    });
  });

  describe("structured values", () => {
    test.each([
      ["string", { kind: "string", value: "s" } as RenderedValue, "s"],
      ["number", { kind: "number", value: 12 } as RenderedValue, 12],
      ["boolean", { kind: "boolean", value: false } as RenderedValue, false],
      ["other", { kind: "other", text: "null" } as RenderedValue, "null"],
    ])("emits a %s leaf directly", (_label, structured, expected) => {
      expect(paramAttrs("ignored", structured)["narrative.param.p"]).toBe(expected);
    });

    test("prefers the structured form over inferring from the rendered string", () => {
      const structured: RenderedValue = { kind: "number", value: 7 };
      expect(paramAttrs("not-a-number", structured)["narrative.param.p"]).toBe(7);
    });

    test.each([
      ["strings", ["a", "b"], "string"],
      ["numbers", [1, 2], "number"],
      ["booleans", [true, false], "boolean"],
    ])("emits a homogeneous list of %s as an array", (_label, values, kind) => {
      const items = values.map((v) => ({ kind, value: v })) as unknown as RenderedValue[];
      const structured: RenderedValue = { kind: "list", items };
      expect(paramAttrs("x", structured)["narrative.param.p"]).toEqual(values);
    });

    test("emits nothing for an empty list", () => {
      expect(paramAttrs("x", { kind: "list", items: [] })).toEqual({});
    });

    test("emits nothing for a mixed-type list, which has no valid attribute form", () => {
      const structured: RenderedValue = {
        kind: "list",
        items: [
          { kind: "string", value: "a" },
          { kind: "number", value: 1 },
        ],
      };
      expect(paramAttrs("x", structured)).toEqual({});
    });

    test("emits nothing for a list of composite values", () => {
      const structured: RenderedValue = {
        kind: "list",
        items: [
          { kind: "object", typeName: "T", fields: {} },
          { kind: "object", typeName: "T", fields: {} },
        ],
      };
      expect(paramAttrs("x", structured)).toEqual({});
    });

    test("flattens object fields into dotted attribute keys", () => {
      const structured: RenderedValue = {
        kind: "object",
        typeName: "Order",
        fields: {
          id: { kind: "string", value: "o-1" },
          total: { kind: "number", value: 99 },
        },
      };
      expect(paramAttrs("x", structured)).toEqual({
        "narrative.param.p.id": "o-1",
        "narrative.param.p.total": 99,
      });
    });

    test("stops flattening at the depth cap instead of recursing without bound", () => {
      // p.a.b.c is depth 3 — the last level allowed; the `d` beneath it must be dropped.
      const deep: RenderedValue = {
        kind: "object",
        typeName: "L0",
        fields: {
          a: {
            kind: "object",
            typeName: "L1",
            fields: {
              b: {
                kind: "object",
                typeName: "L2",
                fields: {
                  c: {
                    kind: "object",
                    typeName: "L3",
                    fields: { d: { kind: "string", value: "too-deep" } },
                  },
                },
              },
            },
          },
        },
      };
      expect(paramAttrs("x", deep)).toEqual({});
    });

    test("keeps fields that sit exactly at the depth cap", () => {
      const atCap: RenderedValue = {
        kind: "object",
        typeName: "L0",
        fields: {
          a: {
            kind: "object",
            typeName: "L1",
            fields: { b: { kind: "string", value: "kept" } },
          },
        },
      };
      expect(paramAttrs("x", atCap)).toEqual({ "narrative.param.p.a.b": "kept" });
    });
  });
});
