// SPDX-License-Identifier: BUSL-1.1
// Licensed under the Business Source License 1.1 (see LICENSE); Change Date: four years from publication; Change License: Apache-2.0
// Copyright (c) 2026 Empower Agile
import { NarrativeTraceConfig, SyncNarrativeContext } from "@narrativetrace/core";
import { describe, expect, test } from "vitest";
import { narrated, onError } from "../src/narrated.js";
import { notTraced } from "../src/not-traced.js";
import { traceObject } from "../src/trace-object.js";
import { traced } from "../src/traced.js";

/**
 * The config twin (TODO §20b): everything the four decorators express, expressed through
 * `ProxyOptions.methods` at the composition root — including on plain objects that never saw a
 * decorator — with config-over-decorator precedence per axis.
 */

function freshContext(): SyncNarrativeContext {
  return new SyncNarrativeContext(new NarrativeTraceConfig());
}

class NotFoundError extends Error {}
class MissingSkuError extends NotFoundError {}

describe("methods config on a plain object (no decorators anywhere)", () => {
  test("params, narration, notTraced, and onError all apply from config alone", () => {
    const service = {
      charge(customerId: string, amount: number, cardToken: string): string {
        return `${customerId}:${amount}:${cardToken.length}`;
      },
    };
    const ctx = freshContext();
    const svc = traceObject(service, ctx, {
      className: "PaymentService",
      methods: {
        charge: {
          params: ["customerId", "amount", "cardToken"],
          narration: "Charging {amount} to {customerId}",
          onError: "Charge failed for {customerId}",
          notTraced: [2],
        },
      },
    });

    svc.charge("C1", 25, "tok-secret");
    const root = ctx.captureTrace().roots[0];
    expect(root?.signature.className).toBe("PaymentService");
    expect(root?.signature.parameters[0]?.name).toBe("customerId");
    expect(root?.signature.parameters[2]?.renderedValue).toBe("[REDACTED]");
    expect(root?.signature.narration).toBe("Charging 25 to C1");
  });

  test("config onError resolves at throw time; redacted params stay redacted in it", () => {
    const service = {
      login(username: string, password: string): string {
        throw new Error(`denied ${username}${password.length}`);
      },
    };
    const ctx = freshContext();
    const svc = traceObject(service, ctx, {
      methods: {
        login: {
          params: ["username", "password"],
          notTraced: [1],
          onError: "Login failed for {username} with {password}",
        },
      },
    });

    expect(() => svc.login("admin", "hunter2")).toThrow();
    const outcome = ctx.captureTrace().roots[0]?.outcome;
    expect(outcome?.kind === "threw" && outcome.errorContext).toBe(
      "Login failed for admin with [REDACTED]",
    );
  });

  test("typed onError declarations pick the most specific matching error type", () => {
    const service = {
      find(sku: string): string {
        throw new MissingSkuError(sku);
      },
    };
    const ctx = freshContext();
    const svc = traceObject(service, ctx, {
      methods: {
        find: {
          params: ["sku"],
          onError: [
            { template: "lookup failed for {sku}" },
            { exception: NotFoundError, template: "nothing found for {sku}" },
            { exception: MissingSkuError, template: "no such SKU {sku}" },
          ],
        },
      },
    });

    expect(() => svc.find("SKU-9")).toThrow(MissingSkuError);
    const outcome = ctx.captureTrace().roots[0]?.outcome;
    expect(outcome?.kind === "threw" && outcome.errorContext).toBe("no such SKU SKU-9");
  });
});

describe("config-over-decorator precedence, per axis", () => {
  class DecoratedService {
    @traced("decoratedName")
    @narrated("decorated narration for {decoratedName}")
    @onError("decorated error for {decoratedName}")
    @notTraced(0)
    op(value: string): string {
      return value;
    }

    @traced("input")
    fails(_input: string): string {
      throw new NotFoundError("x");
    }
  }

  test("each configured axis overrides its decorator; absent axes keep the decorator", () => {
    const ctx = freshContext();
    const svc = traceObject(new DecoratedService(), ctx, {
      methods: { op: { params: ["configuredName"], notTraced: [] } },
    });

    svc.op("visible");
    const root = ctx.captureTrace().roots[0];
    // params + notTraced configured: config wins (empty notTraced list un-redacts).
    expect(root?.signature.parameters[0]?.name).toBe("configuredName");
    expect(root?.signature.parameters[0]?.renderedValue).toBe('"visible"');
    // narration not configured: decorator still in force, resolved against config's names.
    expect(root?.signature.narration).toBe("decorated narration for {decoratedName}");
  });

  test("configured narration and onError replace the decorators' templates", () => {
    const ctx = freshContext();
    const svc = traceObject(new DecoratedService(), ctx, {
      methods: {
        op: { narration: "configured narration for {decoratedName}" },
        fails: { onError: "configured error for {input}" },
      },
    });

    svc.op("v");
    expect(() => svc.fails("in-1")).toThrow(NotFoundError);
    const roots = ctx.captureTrace().roots;
    // @notTraced(0) is not overridden here, so the configured template still sees the marker.
    expect(roots[0]?.signature.narration).toBe("configured narration for [REDACTED]");
    const outcome = roots[1]?.outcome;
    expect(outcome?.kind === "threw" && outcome.errorContext).toBe("configured error for in-1");
  });

  test("methods.params wins over the positional paramNames map", () => {
    class Svc {
      op(x: string): string {
        return x;
      }
    }
    const ctx = freshContext();
    const svc = traceObject(
      new Svc(),
      ctx,
      { op: ["mapName"] },
      {
        methods: { op: { params: ["methodsName"] } },
      },
    );
    svc.op("val");
    expect(ctx.captureTrace().roots[0]?.signature.parameters[0]?.name).toBe("methodsName");
  });
});

describe("third-argument routing", () => {
  test("a paramNames map whose method is literally named 'methods' still routes as names", () => {
    const service = {
      methods(kind: string): string {
        return kind;
      },
    };
    const ctx = freshContext();
    const svc = traceObject(service, ctx, { methods: ["kind"] });
    svc.methods("GET");
    expect(ctx.captureTrace().roots[0]?.signature.parameters[0]?.name).toBe("kind");
  });

  test("four-argument form keeps working: names third, options fourth", () => {
    class Svc {
      op(x: string): string {
        return x;
      }
    }
    const ctx = freshContext();
    const svc = traceObject(new Svc(), ctx, { op: ["mapName"] }, { includeReturnValues: false });
    svc.op("val");
    const root = ctx.captureTrace().roots[0];
    expect(root?.signature.parameters[0]?.name).toBe("mapName");
    expect(root?.outcome.kind === "returned" && root.outcome.renderedValue).toBeNull();
  });
});

// An unrecognised option shape must fail loudly, never silently: the historical failure mode was
// `{ methods: { charge: { notTraced: [2] } } }` landing on a traceObject build that predated the
// config twin, being treated as a bare paramNames map (`config.paramNames["charge"]` never
// existed, so parameters fell back to `arg0`/`arg1`/... and `notTraced` was never applied) —
// compiling, running, and redacting nothing, with no error anywhere.
describe("unrecognised option keys are rejected, not silently ignored", () => {
  class Svc {
    op(x: string): string {
      return x;
    }
  }

  test("an unknown top-level ProxyOptions key throws, naming the accepted keys", () => {
    const ctx = freshContext();
    expect(() =>
      traceObject(new Svc(), ctx, {
        className: "Svc",
        // @ts-expect-error deliberately wrong key for the runtime-rejection test
        notARealOption: true,
      }),
    ).toThrow(/unrecognised key\(s\) notARealOption.*className, includeReturnValues, methods/);
  });

  test("an unknown per-method config key throws, naming the accepted keys", () => {
    const ctx = freshContext();
    expect(() =>
      traceObject(new Svc(), ctx, {
        methods: {
          // @ts-expect-error deliberately wrong key for the runtime-rejection test
          op: { notTraced: [0], nottraced: [0] },
        },
      }),
    ).toThrow(/unrecognised key\(s\) nottraced.*params, notTraced, narration, onError/);
  });

  test("methods.<name> nested directly under `methods` (skipping the method key) throws", () => {
    const ctx = freshContext();
    expect(() =>
      traceObject(new Svc(), ctx, {
        // The doc-described shape is `methods: { <methodName>: { notTraced: [...] } }` — putting
        // `notTraced` directly under `methods` skips the method-name level entirely.
        // @ts-expect-error deliberately wrong shape for the runtime-rejection test
        methods: { notTraced: [0] },
      }),
    ).toThrow(
      /methods\.notTraced must be an object with keys: params, notTraced, narration, onError/,
    );
  });

  test("a well-formed config form is unaffected by the new validation", () => {
    const ctx = freshContext();
    const svc = traceObject(new Svc(), ctx, {
      className: "Svc",
      includeReturnValues: true,
      methods: { op: { params: ["x"], notTraced: [] } },
    });
    svc.op("val");
    expect(ctx.captureTrace().roots[0]?.signature.parameters[0]?.name).toBe("x");
  });
});
