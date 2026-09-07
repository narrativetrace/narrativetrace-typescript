// SPDX-License-Identifier: BUSL-1.1
// Licensed under the Business Source License 1.1 (see LICENSE); Change Date: four years from publication; Change License: Apache-2.0
// Copyright (c) 2026 Empower Agile
import { describe, expect, test } from "vitest";
import { boundedContext } from "../src/bounded-context.js";

describe("BoundedContext", () => {
  test("carries its name, package prefixes and description", () => {
    const context = boundedContext("billing", ["packages/billing"], "Charging, invoicing, funds");

    expect(context.name).toBe("billing");
    expect(context.packages).toStrictEqual(["packages/billing"]);
    expect(context.description).toBe("Charging, invoicing, funds");
  });

  test("omits an undeclared description rather than storing null", () => {
    expect(boundedContext("billing", []).description).toBeUndefined();
  });

  test("accepts an empty prefix list, as the _unassigned fallback declares none", () => {
    expect(boundedContext("_unassigned", []).packages).toStrictEqual([]);
  });

  test("rejects a name that is empty or only whitespace", () => {
    expect(() => boundedContext("", [])).toThrow(TypeError);
    expect(() => boundedContext("   ", [])).toThrow(TypeError);
  });

  test("rejects a package prefix that is empty or only whitespace", () => {
    expect(() => boundedContext("billing", [""])).toThrow(TypeError);
    expect(() => boundedContext("billing", ["packages/billing", "  "])).toThrow(TypeError);
  });

  test("copies the prefix list so later caller mutation cannot corrupt it", () => {
    const packages = ["packages/billing"];
    const context = boundedContext("billing", packages);

    packages.push("packages/shipping");

    expect(context.packages).toStrictEqual(["packages/billing"]);
  });
});
