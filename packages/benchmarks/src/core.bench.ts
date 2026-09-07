// SPDX-License-Identifier: BUSL-1.1
// Licensed under the Business Source License 1.1 (see LICENSE); Change Date: four years from publication; Change License: Apache-2.0
// Copyright (c) 2026 Empower Agile
import { NarrativeTraceConfig, parameterCapture, SyncNarrativeContext } from "@narrativetrace/core";
import { bench, describe } from "vitest";

describe("context enter/exit cycle", () => {
  bench("single enter + exitWithReturn", () => {
    const ctx = new SyncNarrativeContext(new NarrativeTraceConfig());
    ctx.enterMethod("Svc", "op", []);
    ctx.exitMethodWithReturn(null);
    ctx.eventPipeline.close();
  });

  bench("enter/exit with 3 parameters", () => {
    const ctx = new SyncNarrativeContext(new NarrativeTraceConfig());
    const params = [
      parameterCapture("id", '"abc"', false),
      parameterCapture("qty", "5", false),
      parameterCapture("note", '"hello"', false),
    ];
    ctx.enterMethod("Svc", "op", params);
    ctx.exitMethodWithReturn('"ok"');
    ctx.eventPipeline.close();
  });

  bench("10 sequential calls", () => {
    const ctx = new SyncNarrativeContext(new NarrativeTraceConfig());
    for (let i = 0; i < 10; i++) {
      ctx.enterMethod("Svc", `op${i}`, []);
      ctx.exitMethodWithReturn(null);
    }
    ctx.eventPipeline.close();
  });

  bench("nested 5-deep calls", () => {
    const ctx = new SyncNarrativeContext(new NarrativeTraceConfig());
    for (let i = 0; i < 5; i++) {
      ctx.enterMethod(`Class${i}`, "method", []);
    }
    for (let i = 0; i < 5; i++) {
      ctx.exitMethodWithReturn(null);
    }
    ctx.eventPipeline.close();
  });
});
