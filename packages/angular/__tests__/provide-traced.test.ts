// SPDX-License-Identifier: BUSL-1.1
// Licensed under the Business Source License 1.1 (see LICENSE); Change Date: four years from publication; Change License: Apache-2.0
// Copyright (c) 2026 Empower Agile
import { Injectable, inject } from "@angular/core";
import { TestBed } from "@angular/core/testing";
import type { NarrativeContext } from "@narrativetrace/core-web";
import { afterEach, describe, expect, test } from "vitest";
import { provideNarrativeTrace } from "../src/provide-narrative-trace.js";
import { provideTraced } from "../src/provide-traced.js";
import { NARRATIVE_CONTEXT } from "../src/tokens.js";

@Injectable()
class DepService {
  value(): string {
    return "dep";
  }
}

@Injectable()
class GreetingService {
  greet(name: string): string {
    return `Hello, ${name}!`;
  }
}

@Injectable()
class GreetingWithDep {
  private readonly dep = inject(DepService);

  greet(): string {
    return this.dep.value();
  }
}

describe("provideTraced", () => {
  afterEach(() => TestBed.resetTestingModule());

  test("traced service method calls appear in trace tree", () => {
    TestBed.configureTestingModule({
      providers: [provideNarrativeTrace(), provideTraced(GreetingService)],
    });

    const svc = TestBed.inject(GreetingService);
    const ctx = TestBed.inject(NARRATIVE_CONTEXT) as NarrativeContext;

    const result = svc.greet("World");

    expect(result).toBe("Hello, World!");
    const tree = ctx.captureTrace();
    expect(tree.roots).toHaveLength(1);
    expect(tree.roots[0].signature.className).toBe("GreetingService");
    expect(tree.roots[0].signature.methodName).toBe("greet");
  });

  test("preserves constructor dependency injection", () => {
    TestBed.configureTestingModule({
      providers: [provideNarrativeTrace(), DepService, provideTraced(GreetingWithDep)],
    });

    const svc = TestBed.inject(GreetingWithDep);
    expect(svc.greet()).toBe("dep");
  });

  test("non-traced services remain unaffected", () => {
    TestBed.configureTestingModule({
      providers: [provideNarrativeTrace(), GreetingService],
    });

    const svc = TestBed.inject(GreetingService);
    const ctx = TestBed.inject(NARRATIVE_CONTEXT) as NarrativeContext;

    svc.greet("World");

    const tree = ctx.captureTrace();
    expect(tree.roots).toHaveLength(0);
  });
});
