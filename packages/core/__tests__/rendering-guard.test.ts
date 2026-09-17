// SPDX-License-Identifier: BUSL-1.1
// Licensed under the Business Source License 1.1 (see LICENSE); Change Date: four years from publication; Change License: Apache-2.0
// Copyright (c) 2026 Empower Agile
import { describe, expect, test } from "vitest";
import { isRenderingInProgress, withRenderingGuard } from "../src/rendering-guard.js";

// Ports the intent of the Java `RenderingGuard` (narrativetrace-core/render/RenderingGuard.java):
// value rendering must be able to answer "am I re-entering myself right now?" so the tracing gate
// (traceObject's wrapMethod, wrapPrototypeMethods' wrapper) can take the untraced fast path instead
// of opening a span for a call the application never made. See value-renderer.test.ts and
// packages/proxy/__tests__/render-reentrancy.test.ts for the end-to-end defect this exists to close.
describe("rendering-guard", () => {
  test("inactive before any render", () => {
    expect(isRenderingInProgress()).toBe(false);
  });

  test("active only for the duration of the guarded call", () => {
    let observedInside: boolean | undefined;
    withRenderingGuard(() => {
      observedInside = isRenderingInProgress();
    });
    expect(observedInside).toBe(true);
    expect(isRenderingInProgress()).toBe(false);
  });

  test("a throw inside the guarded call still clears it", () => {
    expect(() =>
      withRenderingGuard(() => {
        throw new Error("boom");
      }),
    ).toThrow("boom");
    expect(isRenderingInProgress()).toBe(false);
  });

  test("returns the callback's value", () => {
    expect(withRenderingGuard(() => 42)).toBe(42);
  });

  // Multiple JS entry points (renderValue, renderCapture) reach the same guard, unlike Java's one
  // ValueRenderer class — nothing here proves a nested call can never happen the way Java's
  // AgentRuntime.isActive() gate does, so a depth counter (not a single boolean) is what makes
  // nesting harmless rather than merely "never observed": the outer scope must stay active until
  // the LAST nested guard exits, not the first.
  test("nested guarded calls stay active until the outermost one exits", () => {
    let innerObserved: boolean | undefined;
    let afterInnerObserved: boolean | undefined;
    withRenderingGuard(() => {
      withRenderingGuard(() => {
        innerObserved = isRenderingInProgress();
      });
      afterInnerObserved = isRenderingInProgress();
    });
    expect(innerObserved).toBe(true);
    expect(afterInnerObserved).toBe(true);
    expect(isRenderingInProgress()).toBe(false);
  });

  test("an inner throw does not clear the guard for the still-running outer call", () => {
    let outerObservedAfterInnerThrow: boolean | undefined;
    withRenderingGuard(() => {
      try {
        withRenderingGuard(() => {
          throw new Error("inner boom");
        });
      } catch {
        // swallowed deliberately — this test is about guard state, not propagation
      }
      outerObservedAfterInnerThrow = isRenderingInProgress();
    });
    expect(outerObservedAfterInnerThrow).toBe(true);
    expect(isRenderingInProgress()).toBe(false);
  });
});
