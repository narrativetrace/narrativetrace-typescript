// SPDX-License-Identifier: BUSL-1.1
// Licensed under the Business Source License 1.1 (see LICENSE); Change Date: four years from publication; Change License: Apache-2.0
// Copyright (c) 2026 Empower Agile
import { describe, expect, test } from "vitest";
import { NarrativeTraceConfig } from "../src/config.js";
import { SyncNarrativeContext } from "../src/context.js";
import { extractContextInfo } from "../src/context-extraction.js";
import type { NarrativeContext } from "../src/narrative-context.js";

function asNarrativeContext(context: SyncNarrativeContext): NarrativeContext {
  return {
    enterMethod: context.enterMethod.bind(context),
    exitMethodWithReturn: context.exitMethodWithReturn.bind(context),
    exitMethodWithException: context.exitMethodWithException.bind(context),
    detachFrame: context.detachFrame.bind(context),
    captureTrace: context.captureTrace.bind(context),
    reset: context.reset.bind(context),
    runScoped: context.runScoped.bind(context),
    parentOf: context.parentOf.bind(context),
    traceId: context.traceId.bind(context),
    setRequestContext: context.setRequestContext.bind(context),
    setUserContext: context.setUserContext.bind(context),
    run: context.run.bind(context),
    isActive: context.isActive,
    storyId: context.storyId,
    chapterId: context.chapterId,
  };
}

describe("extractContextInfo", () => {
  test("extracts config and pipeline from SyncNarrativeContext", () => {
    const ctx = new SyncNarrativeContext(new NarrativeTraceConfig("detail"));
    const info = extractContextInfo(ctx);
    expect(info.config).toBe(ctx.config);
    expect(info.pipeline).toBe(ctx.eventPipeline);
  });

  test("throws when given a plain-object NarrativeContext adapter", () => {
    const ctx = new SyncNarrativeContext(new NarrativeTraceConfig("detail"));
    const adapter = asNarrativeContext(ctx);
    expect(() => extractContextInfo(adapter)).toThrow();
  });
});
