// SPDX-License-Identifier: BUSL-1.1
// Licensed under the Business Source License 1.1 (see LICENSE); Change Date: four years from publication; Change License: Apache-2.0
// Copyright (c) 2026 Empower Agile
import {
  exportJson,
  incomplete,
  methodSignature,
  parameterCapture,
  returned,
  threw,
  traceNode,
  traceTree,
} from "@narrativetrace/core";
import { describe, expect, test } from "vitest";
import { readTraceExport } from "../src/trace-export-reader.js";

const CHARGE = methodSignature("PaymentService", "charge", [
  parameterCapture("customerId", '"C-BROKE"', false),
]);

describe("readTraceExport", () => {
  test("reads one call back from the JSON a trace run wrote", () => {
    const exported = exportJson(traceTree([traceNode(CHARGE, returned("true"), [])]), {
      scenario: "charge succeeds",
    });

    expect(readTraceExport(exported)).toStrictEqual({
      scenario: "charge succeeds",
      calls: [
        {
          className: "PaymentService",
          methodName: "charge",
          parameters: [{ name: "customerId", value: '"C-BROKE"' }],
          outcome: "returned",
          returnValue: "true",
          children: [],
        },
      ],
    });
  });

  test("carries a thrown error's type and message through untouched", () => {
    const error = new RangeError("balance 12.50 below required 74.97");
    const exported = exportJson(traceTree([traceNode(CHARGE, threw(error), [])]), {
      scenario: "charge fails",
    });

    expect(readTraceExport(exported).calls[0]).toMatchObject({
      outcome: "threw",
      errorType: "RangeError",
      errorMessage: "balance 12.50 below required 74.97",
    });
  });

  test("reads a call that never completed", () => {
    const exported = exportJson(traceTree([traceNode(CHARGE, incomplete(), [])]), {
      scenario: "charge hangs",
    });

    expect(readTraceExport(exported).calls[0]).toMatchObject({ outcome: "incomplete" });
    expect(readTraceExport(exported).calls[0]).not.toHaveProperty("returnValue");
  });

  test("a void completion exports no return value to read", () => {
    const exported = exportJson(traceTree([traceNode(CHARGE, returned(null), [])]), {
      scenario: "charge returns nothing",
    });

    expect(readTraceExport(exported).calls[0]).toMatchObject({ outcome: "returned" });
    expect(readTraceExport(exported).calls[0]).not.toHaveProperty("returnValue");
  });

  test("keeps an explicit null return value distinct from an absent one", () => {
    // Hand-built, because this runtime's exporter now omits the key for a void completion. The
    // reader must still cope: input is machine-written, and a document from another port or an
    // older release can carry an explicit null.
    const withNull = JSON.stringify({
      version: "1.0",
      scenario: { name: "charge returns null", result: "success" },
      events: [
        { spanId: "1", type: "enter", className: "PaymentService", methodName: "charge" },
        {
          spanId: "1",
          type: "exit",
          className: "PaymentService",
          methodName: "charge",
          outcome: "returned",
          returnValue: null,
        },
      ],
    });

    expect(readTraceExport(withNull).calls[0]?.returnValue).toBeNull();
  });

  test("nests a call under the caller that entered it", () => {
    const debit = traceNode(methodSignature("LedgerService", "debit", []), returned("null"), []);
    const exported = exportJson(traceTree([traceNode(CHARGE, returned("true"), [debit])]), {
      scenario: "charge succeeds",
    });

    const { calls } = readTraceExport(exported);

    expect(calls.map((call) => call.methodName)).toStrictEqual(["charge"]);
    expect(calls[0]?.children.map((call) => call.methodName)).toStrictEqual(["debit"]);
  });

  test("reads a call with no parameters as having none", () => {
    const bare = methodSignature("PaymentService", "settle", []);
    const exported = exportJson(traceTree([traceNode(bare, returned("true"), [])]), {
      scenario: "settle",
    });

    expect(readTraceExport(exported).calls[0]?.parameters).toStrictEqual([]);
  });

  test("reads a call whose exit never arrived as incomplete", () => {
    const truncated =
      '{"scenario":{"name":"x"},"events":[{"spanId":"1","type":"enter","className":"A","methodName":"b"}]}';

    expect(readTraceExport(truncated).calls[0]).toStrictEqual({
      className: "A",
      methodName: "b",
      parameters: [],
      outcome: "incomplete",
      children: [],
    });
  });

  test("names the field an author has to fix, in every rejection", () => {
    const event = (body: string) => `{"scenario":{"name":"x"},"events":[${body}]}`;
    const enter = (extra: string) =>
      event(`{"spanId":"1","type":"enter","className":"A","methodName":"b"${extra}}`);

    expect(() => readTraceExport("1")).toThrow("trace export must be a JSON object");
    expect(() => readTraceExport('{"scenario":1,"events":[]}')).toThrow(
      "scenario must be a JSON object",
    );
    expect(() => readTraceExport('{"scenario":{"name":1},"events":[]}')).toThrow(
      "scenario name must be a JSON string",
    );
    expect(() => readTraceExport('{"scenario":{"name":"x"},"events":1}')).toThrow(
      "events must be a JSON array",
    );
    expect(() => readTraceExport(event("1"))).toThrow("event must be a JSON object");
    expect(() => readTraceExport(event('{"spanId":"1"}'))).toThrow(
      "missing required key 'type' in event",
    );
    expect(() => readTraceExport(event('{"spanId":"1","type":1}'))).toThrow(
      "event type must be a JSON string",
    );
    expect(() => readTraceExport(event('{"spanId":"1","type":"enter"}'))).toThrow(
      "missing required key 'className' in event",
    );
    expect(() => readTraceExport(event('{"spanId":"1","type":"enter","className":"A"}'))).toThrow(
      "missing required key 'methodName' in event",
    );
    expect(() => readTraceExport(enter(',"parentSpanId":1'))).toThrow(
      "parentSpanId must be a JSON string",
    );
  });

  test("names the exit field an author has to fix", () => {
    const exit = (extra: string) =>
      `{"scenario":{"name":"x"},"events":[{"spanId":"1","type":"enter","className":"A","methodName":"b"},{"spanId":"1","type":"exit"${extra}}]}`;

    expect(() => readTraceExport(exit(""))).toThrow("missing required key 'outcome' in exit event");
    expect(() => readTraceExport(exit(',"outcome":"returned","returnValue":1'))).toThrow(
      "returnValue must be a JSON string",
    );
    expect(() => readTraceExport(exit(',"outcome":"threw","errorType":1'))).toThrow(
      "errorType must be a JSON string",
    );
    expect(() => readTraceExport(exit(',"outcome":"threw","errorMessage":1'))).toThrow(
      "errorMessage must be a JSON string",
    );
  });

  test("rejects a document that is not a trace export", () => {
    expect(() => readTraceExport("[]")).toThrow(TypeError);
    expect(() => readTraceExport("{}")).toThrow("missing required key 'scenario' in trace export");
    expect(() => readTraceExport('{"scenario":{"name":"x"}}')).toThrow(
      "missing required key 'events' in trace export",
    );
    expect(() => readTraceExport('{"scenario":{},"events":[]}')).toThrow(
      "missing required key 'name' in scenario",
    );
  });

  test("rejects an event whose identifying fields are the wrong shape", () => {
    const event = (body: string) => `{"scenario":{"name":"x"},"events":[${body}]}`;

    expect(() => readTraceExport(event('{"spanId":1}'))).toThrow("spanId must be a JSON string");
    expect(() => readTraceExport(event('{"type":"enter"}'))).toThrow(
      "missing required key 'spanId' in event",
    );
    expect(() => readTraceExport(event('{"spanId":"1","type":"enter","className":1}'))).toThrow(
      "className must be a JSON string",
    );
    expect(() =>
      readTraceExport(event('{"spanId":"1","type":"enter","className":"A","methodName":1}')),
    ).toThrow("methodName must be a JSON string");
  });

  test("rejects a parameter that lost its name or its value", () => {
    const enter = (parameters: string) =>
      `{"scenario":{"name":"x"},"events":[{"spanId":"1","type":"enter","className":"A","methodName":"b","parameters":${parameters}}]}`;

    expect(() => readTraceExport(enter('[{"value":"1"}]'))).toThrow(
      "missing required key 'name' in parameter",
    );
    expect(() => readTraceExport(enter('[{"name":"n"}]'))).toThrow(
      "missing required key 'value' in parameter",
    );
    expect(() => readTraceExport(enter('[{"name":1,"value":"1"}]'))).toThrow(
      "parameter name must be a JSON string",
    );
    expect(() => readTraceExport(enter('[{"name":"n","value":1}]'))).toThrow(
      "parameter value must be a JSON string",
    );
    expect(() => readTraceExport(enter("[1]"))).toThrow("parameter must be a JSON object");
    expect(() => readTraceExport(enter('"n: 1"'))).toThrow("parameters must be a JSON array");
  });

  test("rejects an exit event whose call was never entered", () => {
    const orphan = '{"scenario":{"name":"x"},"events":[{"spanId":"7","type":"exit"}]}';

    expect(() => readTraceExport(orphan)).toThrow(/span '7'/);
  });

  test("rejects a call whose caller is not in the file", () => {
    const orphan =
      '{"scenario":{"name":"x"},"events":[{"spanId":"2","type":"enter","className":"A","methodName":"b","parentSpanId":"1"}]}';

    expect(() => readTraceExport(orphan)).toThrow(/span '1'/);
  });
});

// Every call's children are built strictly bottom-up from a flat, append-only enter/exit event
// stream with fixed parentSpanId links — structurally incapable of a cycle (an "enter" always
// creates a fresh call object, so nothing already placed in a children array can become its own
// ancestor). Only the depth half of the tree-walk finding applies here.
// Cross-runtime mirror of the 2026-09-03 unbounded-tree-walk finding (Java golden source).
describe("bounded call-tree walk (a very deep stored trace)", () => {
  function deepChainJson(length: number): string {
    const events: unknown[] = [];
    for (let i = 0; i < length; i++) {
      events.push({
        spanId: String(i),
        type: "enter",
        className: "Svc",
        methodName: "op",
        ...(i > 0 ? { parentSpanId: String(i - 1) } : {}),
      });
    }
    return JSON.stringify({ scenario: { name: "deep" }, events });
  }

  test("does not stack-overflow reading a very deep parentSpanId chain", () => {
    expect(() => readTraceExport(deepChainJson(50_000))).not.toThrow();
  });
});
