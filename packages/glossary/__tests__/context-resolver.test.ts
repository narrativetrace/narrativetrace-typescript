// SPDX-License-Identifier: BUSL-1.1
// Licensed under the Business Source License 1.1 (see LICENSE); Change Date: four years from publication; Change License: Apache-2.0
// Copyright (c) 2026 Empower Agile
import { describe, expect, test } from "vitest";
import { boundedContext } from "../src/bounded-context.js";
import { resolveContext, UNASSIGNED_CONTEXT } from "../src/context-resolver.js";
import { glossary } from "../src/glossary.js";

function withContexts(declarations: Record<string, string[]>) {
  return glossary(
    1,
    new Map(
      Object.entries(declarations).map(([name, packages]) => [
        name,
        boundedContext(name, packages),
      ]),
    ),
    [],
  );
}

describe("resolveContext", () => {
  test("resolves a source path to the context that declares its prefix", () => {
    const model = withContexts({ billing: ["packages/billing"] });

    expect(resolveContext(model, "packages/billing")).toBe("billing");
    expect(resolveContext(model, "packages/billing/overdraft-service.ts")).toBe("billing");
  });

  test("does not let a prefix claim a sibling that merely starts with it", () => {
    const model = withContexts({ billing: ["packages/billing"] });

    expect(resolveContext(model, "packages/billingx")).toBe(UNASSIGNED_CONTEXT);
    expect(resolveContext(model, "packages/billingx/foo.ts")).toBe(UNASSIGNED_CONTEXT);
    expect(resolveContext(model, "packages/billing-legacy/foo.ts")).toBe(UNASSIGNED_CONTEXT);
  });

  test("treats a dot as a boundary, so module paths resolve too", () => {
    const model = withContexts({ billing: ["acme.billing"] });

    expect(resolveContext(model, "acme.billing.OverdraftService")).toBe("billing");
    expect(resolveContext(model, "acme.billingx.Foo")).toBe(UNASSIGNED_CONTEXT);
  });

  // Bug-hunt no-poison contract: Java's exact repro shape (Micronaut wrapped
  // com.acme2 because it used a raw prefix check; Spring's dot-boundary rule did not). This
  // resolver already uses the dot-boundary rule (see the two tests above) — pinned here with
  // Java's own example so the finding has a directly traceable regression, not just an
  // equivalent one under different names.
  test("a base context does not match a sibling package with a shared prefix (com.acme vs com.acme2)", () => {
    const model = withContexts({ acme: ["com.acme"] });

    expect(resolveContext(model, "com.acme.OrderService")).toBe("acme");
    expect(resolveContext(model, "com.acme2.OrderService")).toBe(UNASSIGNED_CONTEXT);
  });

  test("lets the longest matching prefix win, so contexts can nest", () => {
    const model = withContexts({
      billing: ["packages/billing"],
      overdraft: ["packages/billing/overdraft"],
    });

    expect(resolveContext(model, "packages/billing/invoice.ts")).toBe("billing");
    expect(resolveContext(model, "packages/billing/overdraft/limit.ts")).toBe("overdraft");
  });

  test("breaks a tie between equally long prefixes deterministically, by context name", () => {
    const model = withContexts({ shipping: ["packages/shared"], billing: ["packages/shared"] });

    expect(resolveContext(model, "packages/shared/money.ts")).toBe("billing");
  });

  test("falls back to _unassigned when nothing matches, so harvesting needs no configuration", () => {
    const model = withContexts({ billing: ["packages/billing"] });

    expect(resolveContext(model, "packages/shipping/parcel.ts")).toBe("_unassigned");
    expect(resolveContext(withContexts({}), "packages/billing")).toBe(UNASSIGNED_CONTEXT);
  });

  test("ignores a context that declares no prefixes", () => {
    const model = withContexts({ _unassigned: [], billing: ["packages/billing"] });

    expect(resolveContext(model, "packages/billing/x.ts")).toBe("billing");
    expect(resolveContext(model, "elsewhere/x.ts")).toBe(UNASSIGNED_CONTEXT);
  });

  test("matches whichever of several prefixes of one context owns the path", () => {
    const model = withContexts({ billing: ["packages/billing", "packages/invoicing"] });

    expect(resolveContext(model, "packages/invoicing/issue.ts")).toBe("billing");
  });

  test("resolves a scoped package name", () => {
    const model = withContexts({ billing: ["@acme/billing"] });

    expect(resolveContext(model, "@acme/billing/src/overdraft.ts")).toBe("billing");
    expect(resolveContext(model, "@acme/billing-legacy/src/x.ts")).toBe(UNASSIGNED_CONTEXT);
  });

  test("rejects a blank path rather than silently reporting _unassigned", () => {
    expect(() => resolveContext(withContexts({}), "")).toThrow(TypeError);
    expect(() => resolveContext(withContexts({}), "  ")).toThrow(TypeError);
  });
});
