// SPDX-License-Identifier: BUSL-1.1
// Licensed under the Business Source License 1.1 (see LICENSE); Change Date: four years from publication; Change License: Apache-2.0
// Copyright (c) 2026 Empower Agile
import { TestBed } from "@angular/core/testing";
import type { NarrativeContext } from "@narrativetrace/core-web";
import { afterEach, describe, expect, test } from "vitest";
import { provideNarrativeTrace } from "../src/provide-narrative-trace.js";
import { NARRATIVE_CONTEXT } from "../src/tokens.js";
import { TraceCaptureService } from "../src/trace-capture-service.js";

describe("TraceCaptureService", () => {
  afterEach(() => TestBed.resetTestingModule());

  test("capture() returns current trace tree", () => {
    TestBed.configureTestingModule({
      providers: [provideNarrativeTrace()],
    });

    const ctx = TestBed.inject(NARRATIVE_CONTEXT) as NarrativeContext;
    const svc = TestBed.inject(TraceCaptureService);

    ctx.enterMethod("Svc", "op", []);
    ctx.exitMethodWithReturn(null);

    const tree = svc.capture();
    expect(tree.roots).toHaveLength(1);
    expect(tree.roots[0].signature.className).toBe("Svc");
  });

  test("reset() clears the context", () => {
    TestBed.configureTestingModule({
      providers: [provideNarrativeTrace()],
    });

    const ctx = TestBed.inject(NARRATIVE_CONTEXT) as NarrativeContext;
    const svc = TestBed.inject(TraceCaptureService);

    ctx.enterMethod("Svc", "op", []);
    ctx.exitMethodWithReturn(null);
    svc.reset();

    const tree = svc.capture();
    expect(tree.roots).toHaveLength(0);
  });

  test("captureAndReset() returns trace then clears", () => {
    TestBed.configureTestingModule({
      providers: [provideNarrativeTrace()],
    });

    const ctx = TestBed.inject(NARRATIVE_CONTEXT) as NarrativeContext;
    const svc = TestBed.inject(TraceCaptureService);

    ctx.enterMethod("Svc", "op", []);
    ctx.exitMethodWithReturn(null);

    const tree = svc.captureAndReset();
    expect(tree.roots).toHaveLength(1);

    const after = svc.capture();
    expect(after.roots).toHaveLength(0);
  });
});
