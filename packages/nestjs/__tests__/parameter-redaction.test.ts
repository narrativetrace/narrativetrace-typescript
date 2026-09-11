// SPDX-License-Identifier: BUSL-1.1
// Licensed under the Business Source License 1.1 (see LICENSE); Change Date: four years from publication; Change License: Apache-2.0
// Copyright (c) 2026 Empower Agile
import {
  BufferedEventConsumer,
  DualPathPipeline,
  NarrativeTraceConfig,
  RedactionPolicy,
  SyncNarrativeContext,
  type TraceEvent,
} from "@narrativetrace/core";
import { notTraced } from "@narrativetrace/proxy";
import { describe, expect, test } from "vitest";
import type { AutoProxyOptions } from "../src/auto-proxy-options.js";
import { NarrativeStorage } from "../src/narrative-storage.js";
import { wrapPrototypeMethods } from "../src/wrap-prototype.js";

function setup() {
  const events: TraceEvent[] = [];
  const pipeline = new DualPathPipeline((e) => events.push(e), new BufferedEventConsumer(64));
  const ctx = new SyncNarrativeContext(new NarrativeTraceConfig("detail"), undefined, pipeline);
  const storage = new NarrativeStorage();
  return { events, ctx, storage };
}

function findEnter(events: TraceEvent[]) {
  const enter = events.find((e) => e.type === "enter");
  if (enter?.type !== "enter") throw new Error("expected an enter event");
  return enter;
}

// Security defect (severe): wrap-prototype's buildEntry hardcoded `redacted: false` for every
// captured parameter, and packages/nestjs/src carried zero references to notTraced/redact —
// @notTraced, which every doc calls unconditional, was SILENTLY IGNORED on every NestJS
// auto-wrapped provider. A user who applied the decorator exactly as documented still leaked.
describe("wrapPrototypeMethods honours @notTraced on auto-wrapped provider methods", () => {
  // A fresh class per test: wrapPrototypeMethods mutates the prototype in place and marks it
  // WRAPPED, so a class shared across tests would route the second test's call through the first
  // test's closed-over NarrativeStorage — a cross-test isolation hazard, not a production one.
  function definePaymentService() {
    class PaymentService {
      @notTraced(1)
      pay(policyId: string, paymentToken: string): string {
        return `paid ${policyId} with ${paymentToken}`;
      }
    }
    return PaymentService;
  }

  test("@notTraced(1) redacts the marked parameter", () => {
    const { events, ctx, storage } = setup();
    const PaymentService = definePaymentService();
    wrapPrototypeMethods(PaymentService.prototype, "PaymentService", storage);
    const svc = new PaymentService();

    storage.run(ctx, () => svc.pay("POL-1", "tok_live_secret_abc123"));

    const enter = findEnter(events);
    const redactedParam = enter.signature.parameters[1];
    expect(redactedParam?.redacted).toBe(true);
    expect(redactedParam?.renderedValue).toBe("[REDACTED]");
    expect(redactedParam?.renderedValue).not.toContain("tok_live_secret_abc123");
  });

  test("a parameter not marked by @notTraced still renders in full", () => {
    const { events, ctx, storage } = setup();
    const PaymentService = definePaymentService();
    wrapPrototypeMethods(PaymentService.prototype, "PaymentService", storage);
    const svc = new PaymentService();

    storage.run(ctx, () => svc.pay("POL-1", "tok_live_secret_abc123"));

    const enter = findEnter(events);
    const visibleParam = enter.signature.parameters[0];
    expect(visibleParam?.redacted).toBe(false);
    expect(visibleParam?.renderedValue).toBe('"POL-1"');
  });
});

// Monotonicity audit (2026-09-10, family-wide): the built-in vocabulary must be a floor
// application code cannot lower. wrap-prototype.ts's buildCaptures never reads a redactionPolicy
// off any config object — the only redaction it ever consults is getRedactedParams(original) (the
// @notTraced registry) and renderValue(a)'s own hardcoded RedactionPolicy.DEFAULT inside
// value-shape masking, since a NestJS auto-wrapped parameter has no recoverable name for the NAME
// axis to begin with (see the documented structural limitation). AutoProxyOptions carries no
// redactionPolicy field either. Attempted here with RedactionPolicy.DISABLED (which turns off
// value-shape masking entirely) sitting in scope and attached to an options object no seam reads —
// a JWT-shaped argument with no @notTraced and no name to match is still redacted at capture.
describe("the built-in redaction vocabulary is a floor wrapPrototypeMethods cannot lower", () => {
  test("a maximally narrowed RedactionPolicy in scope does not reach capture (value-shape axis)", () => {
    const attemptedNarrowing = RedactionPolicy.DISABLED;
    const unreachableOptions = {
      redactionPolicy: attemptedNarrowing,
    } as unknown as AutoProxyOptions;
    void unreachableOptions; // AutoProxyOptions has no seam that reads this; wrapPrototypeMethods
    // itself takes no options parameter at all — nothing here can plug attemptedNarrowing in.

    const { events, ctx, storage } = setup();
    class TokenService {
      verify(_token: string): string {
        return "ok";
      }
    }
    wrapPrototypeMethods(TokenService.prototype, "TokenService", storage);
    const svc = new TokenService();
    const jwt =
      "eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiIxMjM0NTY3ODkwIn0.dozjgNryP4J3jVmNHl0w5N_XgL0n3I9PlFUP0THsR8U";

    storage.run(ctx, () => svc.verify(jwt));

    const enter = findEnter(events);
    const param = enter.signature.parameters[0];
    // The value-shape axis protects renderedValue directly (renderCapture's internal
    // shouldRedactValue check substitutes the marker before the string is ever produced) AND flips
    // the `redacted` flag (family-wide ruling 2026-09-10: `redacted === true` iff the parameter's
    // whole value was withheld, by name OR because the top-level shape match consumed the entire
    // rendering — see ParameterCapture.redacted's doc comment). Names are unrecoverable through
    // this auto-wrap path (every parameter renders as `argN`), so value-shape is the ONLY axis
    // that can ever flag a capture built here.
    expect(param?.renderedValue).toBe("[REDACTED]");
    expect(param?.renderedValue).not.toContain("eyJhbGciOiJIUzI1NiJ9");
    expect(param?.redacted).toBe(true);
  });
});
