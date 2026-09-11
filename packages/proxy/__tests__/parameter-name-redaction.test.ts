// SPDX-License-Identifier: BUSL-1.1
// Licensed under the Business Source License 1.1 (see LICENSE); Change Date: four years from publication; Change License: Apache-2.0
// Copyright (c) 2026 Empower Agile
import {
  NarrativeTraceConfig,
  RedactionPolicy,
  renderIndentedText,
  renderMarkdown,
  renderProse,
  SyncNarrativeContext,
} from "@narrativetrace/core";
import { describe, expect, test } from "vitest";
import { type ProxyOptions, traceObject } from "../src/trace-object.js";

// Security defect (found in the wild): RedactionPolicy's always-on NAME deny-list is applied to
// object field names but was never applied to method PARAMETER names. `@notTraced(i)` covers an
// explicit index; a parameter merely *named* like a secret — no decorator anywhere — rendered in
// cleartext. Every fixture below carries NO `@notTraced` and NO `static notTraced`: proving the
// name axis holds on its own, not that the decorator works (the decorator's own coverage already
// proved that, which is exactly how this gap went unnoticed).
describe("parameter redaction by name alone (no @notTraced decorator anywhere)", () => {
  function detailContext() {
    return new SyncNarrativeContext(new NarrativeTraceConfig("detail"));
  }

  test("a parameter named 'password' is redacted by name alone", () => {
    const context = detailContext();
    class AuthService {
      login(username: string, password: string): boolean {
        return username === "admin" && password.length > 0;
      }
    }
    const traced = traceObject(new AuthService(), context, { login: ["username", "password"] });

    traced.login("admin", "hunter2");

    const params = context.captureTrace().roots[0]?.signature.parameters ?? [];
    const pw = params.find((p) => p.name === "password");
    expect(pw?.redacted).toBe(true);
    expect(pw?.renderedValue).toBe("[REDACTED]");
  });

  test("a camelCase compound of a deny-listed word ('paymentToken') is redacted", () => {
    const context = detailContext();
    class PaymentService {
      pay(policyId: string, paymentToken: string): string {
        return `paid ${policyId} with ${paymentToken}`;
      }
    }
    const traced = traceObject(new PaymentService(), context, {
      pay: ["policyId", "paymentToken"],
    });

    traced.pay("POL-1", "tok_live_secret_abc123");

    const params = context.captureTrace().roots[0]?.signature.parameters ?? [];
    const token = params.find((p) => p.name === "paymentToken");
    expect(token?.redacted).toBe(true);
    expect(token?.renderedValue).toBe("[REDACTED]");
    expect(token?.renderedValue).not.toContain("tok_live_secret_abc123");
  });

  // Guard against over-redaction: must pass both before and after the fix.
  test("ordinary parameters stay visible", () => {
    const context = detailContext();
    class OrderService {
      placeOrder(orderNumber: string, quantity: number): string {
        return `${orderNumber} x${quantity}`;
      }
    }
    const traced = traceObject(new OrderService(), context, {
      placeOrder: ["orderNumber", "quantity"],
    });

    traced.placeOrder("ORD-42", 3);

    const params = context.captureTrace().roots[0]?.signature.parameters ?? [];
    const order = params.find((p) => p.name === "orderNumber");
    const qty = params.find((p) => p.name === "quantity");
    expect(order?.redacted).toBe(false);
    expect(order?.renderedValue).toBe('"ORD-42"');
    expect(qty?.redacted).toBe(false);
    expect(qty?.renderedValue).toBe("3");
  });

  // Redaction is decided once, at capture — a value redacted there must stay redacted on every
  // one of this runtime's renderers, not just whichever one a first fix happened to touch.
  test("redaction by name holds across every renderer this port has", () => {
    const context = detailContext();
    class PaymentService {
      pay(_paymentToken: string): string {
        return "charged";
      }
    }
    const traced = traceObject(new PaymentService(), context, { pay: ["paymentToken"] });

    traced.pay("tok_live_secret_abc123");

    const tree = context.captureTrace();
    const outputs = {
      markdown: renderMarkdown(tree),
      indentedText: renderIndentedText(tree),
      prose: renderProse(tree),
    };
    for (const [name, output] of Object.entries(outputs)) {
      expect(output, `${name} must not leak the raw token`).not.toContain("tok_live_secret_abc123");
      expect(output, `${name} must show the redaction marker`).toContain("[REDACTED]");
    }
  });

  // A narration/error template must not leak a name-redacted parameter either — the same
  // capture-time decision feeds buildValueMap, so this must hold without any @notTraced.
  test("a name-redacted parameter cannot leak through a narration template", async () => {
    const { narrated } = await import("../src/narrated.js");
    const context = detailContext();
    class PaymentService {
      @narrated("Charged card with {paymentToken}")
      pay(_paymentToken: string): string {
        return "charged";
      }
    }
    const traced = traceObject(new PaymentService(), context, { pay: ["paymentToken"] });

    traced.pay("tok_live_secret_abc123");

    const tree = context.captureTrace();
    const markdown = renderMarkdown(tree);
    expect(markdown).not.toContain("tok_live_secret_abc123");
  });
});

// Monotonicity audit (2026-09-10, family-wide): the built-in vocabulary must be a floor
// application code cannot lower. RedactionPolicy.ofPatterns()/DISABLED do replace the vocabulary
// wholesale rather than extending it (see redaction-policy.test.ts's own "ofPatterns replaces the
// deny-list entirely" pin) — but replacing an INSTANCE proves nothing about capture unless that
// instance can actually reach a capture decision. It cannot: resolveRedactedFlags in
// trace-object.ts calls RedactionPolicy.DEFAULT.isRedacted(...) directly (a hardcoded static
// reference, not a field read off any config object), and ProxyOptions/MethodTraceConfig below
// carry no redactionPolicy property to plug one into. Attempted here with the most aggressive
// narrowing available (RedactionPolicy.DISABLED turns off BOTH the name axis and the value-shape
// axis) sitting in scope and attached to the options object via an escape-hatch cast — a
// `password` parameter is still redacted at capture regardless.
describe("the built-in redaction vocabulary is a floor traceObject() cannot lower", () => {
  test("a maximally narrowed RedactionPolicy in scope, and spread into options, does not reach capture", () => {
    const attemptedNarrowing = RedactionPolicy.DISABLED;
    const context = new SyncNarrativeContext(new NarrativeTraceConfig("detail"));
    class AuthService {
      login(username: string, password: string): boolean {
        return username === "admin" && password.length > 0;
      }
    }
    // ProxyOptions has no redactionPolicy field at all — attaching one anyway (via an escape
    // hatch a real attacker's config-merging code could equally produce) proves the point
    // structurally: an unknown property here is simply inert, never read by resolveRedactedFlags.
    const options = {
      className: "AuthService",
      redactionPolicy: attemptedNarrowing,
    } as unknown as ProxyOptions;
    const traced = traceObject(
      new AuthService(),
      context,
      { login: ["username", "password"] },
      options,
    );

    traced.login("admin", "hunter2");

    const params = context.captureTrace().roots[0]?.signature.parameters ?? [];
    const pw = params.find((p) => p.name === "password");
    expect(pw?.redacted).toBe(true);
    expect(pw?.renderedValue).toBe("[REDACTED]");
  });
});

// Value-shape defect (found 2026-09-10, family-wide): a shape-caught value substituted the
// `[REDACTED]` marker into renderedValue without ever flipping the `redacted` flag — the metadata
// disagreed with the output. Fixed via the capture-oriented `renderCapture` seam in
// value-renderer.ts; see ParameterCapture.redacted's own doc comment for the full ruling this pins.
describe("value-shape redaction sets the redacted flag, not only the rendered text", () => {
  const jwt =
    "eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiIxMjM0NTY3ODkwIn0.dozjgNryP4J3jVmNHl0w5N_XgL0n3I9PlFUP0THsR8U";

  test("a JWT-shaped argument under an innocuous name is flagged redacted", () => {
    const context = new SyncNarrativeContext(new NarrativeTraceConfig("detail"));
    class TokenService {
      verify(_token: string): string {
        return "ok";
      }
    }
    const traced = traceObject(new TokenService(), context, { verify: ["token"] });

    traced.verify(jwt);

    const params = context.captureTrace().roots[0]?.signature.parameters ?? [];
    const token = params.find((p) => p.name === "token");
    expect(token?.redacted).toBe(true);
    expect(token?.renderedValue).toBe("[REDACTED]");
  });

  // The documented boundary: a shape match on a NESTED leaf masks that leaf in text exactly as a
  // top-level match would, but the parameter as a whole still carries other, unredacted content —
  // so the flag stays false. The flag is per-parameter; shape matches are per-leaf.
  test("a nested JWT inside an object argument masks the leaf but does not flag the whole parameter", () => {
    const context = new SyncNarrativeContext(new NarrativeTraceConfig("detail"));
    class TokenService {
      submit(_payload: { token: string; note: string }): string {
        return "ok";
      }
    }
    const traced = traceObject(new TokenService(), context, { submit: ["payload"] });

    traced.submit({ token: jwt, note: "ok" });

    const params = context.captureTrace().roots[0]?.signature.parameters ?? [];
    const payload = params.find((p) => p.name === "payload");
    expect(payload?.redacted).toBe(false);
    expect(payload?.renderedValue).toContain("[REDACTED]");
    expect(payload?.renderedValue).not.toContain(jwt);
  });
});
