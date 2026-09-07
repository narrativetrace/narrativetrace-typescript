// SPDX-License-Identifier: BUSL-1.1
// Licensed under the Business Source License 1.1 (see LICENSE); Change Date: four years from publication; Change License: Apache-2.0
// Copyright (c) 2026 Empower Agile
import { afterEach, describe, expect, it } from "vitest";
import { createLogEnricher } from "../src/callback-adapter.js";
import { LogContext } from "../src/log-context.js";

describe("createLogEnricher", () => {
  afterEach(() => LogContext.reset());

  it("calls callback with current LogContext values", () => {
    const captured: Record<string, string | number>[] = [];
    const enricher = createLogEnricher((ctx) => captured.push(ctx));

    LogContext.set("code.namespace", "OrderService");
    LogContext.set("nt.depth", 0);
    enricher();

    expect(captured).toEqual([{ "code.namespace": "OrderService", "nt.depth": 0 }]);
  });

  it("callback receives empty object when no context is set", () => {
    const captured: Record<string, string | number>[] = [];
    const enricher = createLogEnricher((ctx) => captured.push(ctx));

    enricher();

    expect(captured).toEqual([{}]);
  });
});
