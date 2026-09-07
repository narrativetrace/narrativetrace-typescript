// SPDX-License-Identifier: BUSL-1.1
// Licensed under the Business Source License 1.1 (see LICENSE); Change Date: four years from publication; Change License: Apache-2.0
// Copyright (c) 2026 Empower Agile
import { describe, expect, test } from "vitest";
import { classifyRoleSuffix, expectedVerbsForRole } from "../src/role-suffix-dictionary.js";

describe("RoleSuffixDictionary", () => {
  test("service is a recognized but unconstrained role (empty expected verbs, Java parity)", () => {
    const verbs = expectedVerbsForRole("service");
    expect(verbs).toBeDefined();
    expect(verbs?.size).toBe(0);
  });

  test("returns expected verbs for repository role", () => {
    const verbs = expectedVerbsForRole("repository");
    expect(verbs).toBeDefined();
    expect(verbs?.has("find")).toBe(true);
    expect(verbs?.has("save")).toBe(true);
    expect(verbs?.has("delete")).toBe(true);
  });

  test("returns undefined for unknown role", () => {
    expect(expectedVerbsForRole("banana")).toBeUndefined();
    expect(expectedVerbsForRole("widget")).toBeUndefined();
  });

  test("is case-insensitive", () => {
    expect(expectedVerbsForRole("Service")).toBeDefined();
    expect(expectedVerbsForRole("REPOSITORY")).toBeDefined();
  });

  test("classifies role suffix categories", () => {
    expect(classifyRoleSuffix("Service")).toBe("designPattern");
    expect(classifyRoleSuffix("Validator")).toBe("functional");
    expect(classifyRoleSuffix("Manager")).toBe("generic");
    expect(classifyRoleSuffix("Order")).toBe("unknown");
  });

  test("classifies newly promoted functional suffixes", () => {
    expect(classifyRoleSuffix("Orchestrator")).toBe("functional");
    expect(classifyRoleSuffix("Policy")).toBe("functional");
    expect(classifyRoleSuffix("Reranker")).toBe("functional");
  });

  test("returns expected verbs for newly promoted roles", () => {
    const policy = expectedVerbsForRole("policy");
    expect(policy).toBeDefined();
    expect(policy?.has("evaluate")).toBe(true);
    expect(policy?.has("enforce")).toBe(true);
    expect(policy?.has("apply")).toBe(true);

    const redactor = expectedVerbsForRole("redactor");
    expect(redactor).toBeDefined();
    expect(redactor?.has("redact")).toBe(true);
    expect(redactor?.has("sanitize")).toBe(true);
  });

  test("verb-carrying roles have at least 3 expected verbs", () => {
    // Java's `service` is intentionally empty (broad role); all other mapped roles carry verbs.
    const roles = [
      "repository",
      "controller",
      "factory",
      "validator",
      "builder",
      "converter",
      "mapper",
      "parser",
      "gateway",
      "orchestrator",
      "policy",
      "redactor",
      "registry",
    ];
    for (const role of roles) {
      const verbs = expectedVerbsForRole(role);
      expect(verbs, `${role} should have verbs`).toBeDefined();
      expect(verbs?.size, `${role} should have ≥3 verbs`).toBeGreaterThanOrEqual(3);
    }
  });
});
