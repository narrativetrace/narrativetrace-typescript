// SPDX-License-Identifier: BUSL-1.1
// Licensed under the Business Source License 1.1 (see LICENSE); Change Date: four years from publication; Change License: Apache-2.0
// Copyright (c) 2026 Empower Agile
import { describe, expect, it } from "vitest";
import {
  methodSignature,
  parameterCapture,
  returned,
  threw,
  traceNode,
  traceTree,
} from "../src/index.js";
import {
  exportStructuralJson,
  projectStructural,
  structuralEntries,
} from "../src/structural-projection.js";

describe("projectStructural — the AI-safe structural projection of a canonical entry", () => {
  it("elides parameter values on a method_enter entry, keeping names", () => {
    const node = traceNode(
      methodSignature("OrderService", "placeOrder", [
        parameterCapture("customerId", '"C-123"', false),
        parameterCapture("quantity", "2", false),
      ]),
      returned('"order-42"'),
      [],
      1,
    );
    const [enter] = structuralEntries(traceTree([node]));
    expect(enter?.["nt.eventType"]).toBe("method_enter");
    expect(enter?.message).toBe("→ OrderService.placeOrder(customerId, quantity)");
    expect(enter?.["nt.parameters"]).toEqual([
      { name: "customerId", value: "[ELIDED]" },
      { name: "quantity", value: "[ELIDED]" },
    ]);
  });

  it("elides the return value on a returning method_exit entry", () => {
    const node = traceNode(methodSignature("Svc", "run", []), returned('"order-42"'), [], 1);
    const [, exit] = structuralEntries(traceTree([node]));
    expect(exit?.["nt.eventType"]).toBe("method_exit");
    expect(exit?.message).toBe("← Svc.run returned");
    expect(exit).not.toHaveProperty("nt.returnValue");
  });

  it("renders the exception type but never the message on a throwing method_exit entry", () => {
    const node = traceNode(
      methodSignature("PaymentGateway", "charge", []),
      threw(new Error("card 4111-1111 declined")),
      [],
      1,
    );
    const [, exit] = structuralEntries(traceTree([node]));
    expect(exit?.message).toBe("!! Error");
    expect(exit?.["exception.type"]).toBe("Error");
    expect(exit).not.toHaveProperty("exception.message");
    expect(JSON.stringify(exit)).not.toContain("4111");
  });

  it("names an incomplete exit without a value", () => {
    const node = traceNode(methodSignature("Svc", "hang", []), returned(null), [], 1);
    const [, exit] = structuralEntries(traceTree([node]));
    expect(exit?.message).toBe("← Svc.run returned".replace("run", "hang"));
  });

  it("rejects a null entry", () => {
    // @ts-expect-error deliberately invalid input
    expect(() => projectStructural(null)).toThrow();
  });

  it("exports a value-free JSON array with no runtime values", () => {
    const node = traceNode(
      methodSignature("OrderService", "placeOrder", [
        parameterCapture("customerId", '"C-123"', false),
      ]),
      returned('"order-42"'),
      [],
      1,
    );
    const json = exportStructuralJson(traceTree([node]));
    expect(json).not.toContain("C-123");
    expect(json).not.toContain("order-42");
    expect(JSON.parse(json)).toHaveLength(2);
  });

  it("passes through non-value fields unchanged", () => {
    const node = traceNode(methodSignature("Svc", "run", []), returned(null), [], 1);
    const [enter] = structuralEntries(traceTree([node]));
    expect(enter?.["code.namespace"]).toBe("Svc");
    expect(enter?.["code.function"]).toBe("run");
    expect(enter?.trace_id).toBeDefined();
  });
});
