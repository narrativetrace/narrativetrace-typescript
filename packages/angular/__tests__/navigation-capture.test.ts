// SPDX-License-Identifier: BUSL-1.1
// Licensed under the Business Source License 1.1 (see LICENSE); Change Date: four years from publication; Change License: Apache-2.0
// Copyright (c) 2026 Empower Agile
import { Component } from "@angular/core";
import { TestBed } from "@angular/core/testing";
import { provideRouter, Router } from "@angular/router";
import type { NarrativeContext, TraceTree } from "@narrativetrace/core-web";
import { afterEach, describe, expect, test } from "vitest";
import { provideNarrativeTrace } from "../src/provide-narrative-trace.js";
import { NARRATIVE_CONTEXT } from "../src/tokens.js";

@Component({ template: "", standalone: true })
class DummyComponent {}

describe("navigation trace capture", () => {
  afterEach(() => TestBed.resetTestingModule());

  test("onTraceCapture fires after navigation with traced methods", async () => {
    const captured: TraceTree[] = [];

    TestBed.configureTestingModule({
      providers: [
        provideNarrativeTrace({
          captureOnNavigation: true,
          onTraceCapture: (trace) => captured.push(trace),
        }),
        provideRouter([
          { path: "", component: DummyComponent },
          { path: "about", component: DummyComponent },
        ]),
      ],
    });

    const router = TestBed.inject(Router);
    const ctx = TestBed.inject(NARRATIVE_CONTEXT) as NarrativeContext;

    ctx.enterMethod("Svc", "op", []);
    ctx.exitMethodWithReturn(null);

    await router.navigateByUrl("/about");

    expect(captured).toHaveLength(1);
    expect(captured[0].roots).toHaveLength(1);
    expect(captured[0].roots[0].signature.methodName).toBe("op");
  });

  test("no capture when captureOnNavigation is false", async () => {
    const captured: TraceTree[] = [];

    TestBed.configureTestingModule({
      providers: [
        provideNarrativeTrace({
          onTraceCapture: (trace) => captured.push(trace),
        }),
        provideRouter([
          { path: "", component: DummyComponent },
          { path: "about", component: DummyComponent },
        ]),
      ],
    });

    const router = TestBed.inject(Router);

    await router.navigateByUrl("/about");

    expect(captured).toHaveLength(0);
  });
});
