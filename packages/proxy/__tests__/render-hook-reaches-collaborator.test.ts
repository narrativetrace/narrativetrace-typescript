// SPDX-License-Identifier: BUSL-1.1
// Licensed under the Business Source License 1.1 (see LICENSE); Change Date: four years from publication; Change License: Apache-2.0
// Copyright (c) 2026 Empower Agile
import { NarrativeTraceConfig, SyncNarrativeContext } from "@narrativetrace/core";
import { describe, expect, test } from "vitest";
import { traceObject } from "../src/trace-object.js";

// B-187 / ADV-2026-10-23-3 — twin of Java's RenderHookReachesProxiedCodeTest: a summary hook that
// calls an intercepted COLLABORATOR (not the rendered value itself) emits no span. The gate of
// every interception engine must read the rendering guard before opening a span.
describe("render hook reaches an intercepted collaborator — traceObject", () => {
  test("a summary hook calling a traced collaborator emits no span", () => {
    const ctx = new SyncNarrativeContext(new NarrativeTraceConfig("detail"));
    const gateway = traceObject({ stamp: () => "stamped" }, ctx);
    class Receipt {
      narrativeSummary(): string {
        return `Receipt(${gateway.stamp()})`;
      }
    }
    const checkout = traceObject({ pay: (_r: Receipt) => "paid" }, ctx);

    expect(checkout.pay(new Receipt())).toBe("paid");

    const names = ctx.captureTrace().roots.map((n) => n.signature.methodName);
    expect(names).toEqual(["pay"]);
  });
});
