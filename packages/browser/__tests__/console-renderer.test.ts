// SPDX-License-Identifier: BUSL-1.1
// Licensed under the Business Source License 1.1 (see LICENSE); Change Date: four years from publication; Change License: Apache-2.0
// Copyright (c) 2026 Empower Agile
import {
  incomplete,
  methodSignature,
  parameterCapture,
  returned,
  type TraceNode,
  threw,
  traceNode,
  traceTree,
} from "@narrativetrace/core-web";
import { describe, expect, it, vi } from "vitest";
import { renderToConsole } from "../src/console-renderer.js";

describe("renderToConsole", () => {
  it("logs a single leaf call via console.log", () => {
    const spy = vi.spyOn(console, "log").mockImplementation(() => {});
    const tree = traceTree([traceNode(methodSignature("Cart", "clear", []), returned(null), [])]);

    renderToConsole(tree);

    expect(spy).toHaveBeenCalledWith("Cart.clear()");
    spy.mockRestore();
  });

  it("uses console.group/groupEnd for nested calls", () => {
    const groupSpy = vi.spyOn(console, "group").mockImplementation(() => {});
    const groupEndSpy = vi.spyOn(console, "groupEnd").mockImplementation(() => {});
    const logSpy = vi.spyOn(console, "log").mockImplementation(() => {});

    const child = traceNode(methodSignature("Repo", "save", []), returned(null), []);
    const parent = traceNode(methodSignature("Service", "checkout", []), returned(null), [child]);
    const tree = traceTree([parent]);

    renderToConsole(tree);

    expect(groupSpy).toHaveBeenCalledWith("Service.checkout()");
    expect(logSpy).toHaveBeenCalledWith("Repo.save()");
    expect(groupEndSpy).toHaveBeenCalledTimes(1);
    groupSpy.mockRestore();
    groupEndSpy.mockRestore();
    logSpy.mockRestore();
  });

  it("formats parameters in the call string", () => {
    const spy = vi.spyOn(console, "log").mockImplementation(() => {});
    const tree = traceTree([
      traceNode(
        methodSignature("Cart", "addItem", [
          parameterCapture("itemId", '"SKU-1"', false),
          parameterCapture("qty", "3", false),
        ]),
        returned(null),
        [],
      ),
    ]);

    renderToConsole(tree);

    expect(spy).toHaveBeenCalledWith('Cart.addItem(itemId: "SKU-1", qty: 3)');
    spy.mockRestore();
  });

  it("appends return value as arrow suffix", () => {
    const spy = vi.spyOn(console, "log").mockImplementation(() => {});
    const tree = traceTree([
      traceNode(methodSignature("Cart", "total", []), returned("42.99"), []),
    ]);

    renderToConsole(tree);

    expect(spy).toHaveBeenCalledWith("Cart.total() → 42.99");
    spy.mockRestore();
  });

  it("shows error marker with message for threw outcome", () => {
    const spy = vi.spyOn(console, "log").mockImplementation(() => {});
    const tree = traceTree([
      traceNode(methodSignature("Payment", "charge", []), threw(new Error("declined")), []),
    ]);

    renderToConsole(tree);

    expect(spy).toHaveBeenCalledWith("Payment.charge() ✗ declined");
    spy.mockRestore();
  });

  it("produces no output for an empty tree", () => {
    const logSpy = vi.spyOn(console, "log").mockImplementation(() => {});
    const groupSpy = vi.spyOn(console, "group").mockImplementation(() => {});

    renderToConsole(traceTree([]));

    expect(logSpy).not.toHaveBeenCalled();
    expect(groupSpy).not.toHaveBeenCalled();
    logSpy.mockRestore();
    groupSpy.mockRestore();
  });

  it("logs narration text when present on the signature", () => {
    const spy = vi.spyOn(console, "log").mockImplementation(() => {});
    const tree = traceTree([
      traceNode(
        methodSignature("Cart", "addItem", [], {
          narration: "Adding item to shopping cart",
        }),
        returned(null),
        [],
      ),
    ]);

    renderToConsole(tree);

    expect(spy).toHaveBeenCalledWith("  Adding item to shopping cart");
    spy.mockRestore();
  });

  it("shows non-Error thrown values as strings", () => {
    const spy = vi.spyOn(console, "log").mockImplementation(() => {});
    const tree = traceTree([traceNode(methodSignature("Api", "call", []), threw("timeout"), [])]);

    renderToConsole(tree);

    expect(spy).toHaveBeenCalledWith("Api.call() ✗ timeout");
    spy.mockRestore();
  });

  it("shows hourglass marker for incomplete outcome", () => {
    const spy = vi.spyOn(console, "log").mockImplementation(() => {});
    const tree = traceTree([traceNode(methodSignature("Api", "call", []), incomplete(), [])]);

    renderToConsole(tree);

    expect(spy).toHaveBeenCalledWith("Api.call() ⏳ (incomplete)");
    spy.mockRestore();
  });

  it("omits return suffix for undefined return value", () => {
    const spy = vi.spyOn(console, "log").mockImplementation(() => {});
    const tree = traceTree([
      traceNode(methodSignature("Logger", "info", []), returned("undefined"), []),
    ]);

    renderToConsole(tree);

    expect(spy).toHaveBeenCalledWith("Logger.info()");
    spy.mockRestore();
  });
});

// A hand-built or deserialized tree can hold an ancestor — nothing at the type level prevents it.
// Cross-port mirror of the 2026-09-03 unbounded-tree-walk finding (Java golden source).
describe("bounded call-tree walk (cyclic and very deep trees)", () => {
  function cyclicRoot(): TraceNode {
    const self = {
      signature: methodSignature("Svc", "op", []),
      outcome: returned('"ok"'),
      children: [] as unknown[],
      durationMs: 0,
      startTimeMs: 0,
    };
    self.children = [self];
    return self as unknown as TraceNode;
  }

  function deepChain(length: number): TraceNode {
    let node = traceNode(methodSignature("Leaf", "op", []), returned('"ok"'), []);
    for (let i = 0; i < length; i++) {
      node = traceNode(methodSignature("Svc", "op", []), returned('"ok"'), [node]);
    }
    return node;
  }

  it("does not crash on a cyclic tree, and marks the cycle instead of looping forever", () => {
    vi.spyOn(console, "log").mockImplementation(() => {});
    vi.spyOn(console, "group").mockImplementation(() => {});
    const groupEndSpy = vi.spyOn(console, "groupEnd").mockImplementation(() => {});

    expect(() => renderToConsole(traceTree([cyclicRoot()]))).not.toThrow();
    expect(groupEndSpy).toHaveBeenCalled();
    vi.restoreAllMocks();
  });

  it("does not stack-overflow on a very deep chain", () => {
    vi.spyOn(console, "log").mockImplementation(() => {});
    vi.spyOn(console, "group").mockImplementation(() => {});
    vi.spyOn(console, "groupEnd").mockImplementation(() => {});

    expect(() => renderToConsole(traceTree([deepChain(50_000)]))).not.toThrow();
    vi.restoreAllMocks();
  });
});
