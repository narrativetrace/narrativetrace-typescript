// SPDX-License-Identifier: BUSL-1.1
// Licensed under the Business Source License 1.1 (see LICENSE); Change Date: four years from publication; Change License: Apache-2.0
// Copyright (c) 2026 Empower Agile
import { describe, expect, it } from "vitest";
import {
  type ArtifactIdentity,
  artifactIdentityOfInvocation,
  artifactIdentityOfMethod,
  fileSlug,
  isInvocation,
  moduleDirectorySlug,
  structuralScenario,
} from "../src/artifact-identity.js";

/**
 * Mirrors Java's `ArtifactIdentityTest` — the family's master definition of per-invocation artifact
 * naming. Every literal here is the cross-runtime contract; the same cases hold in every runtime.
 */
describe("ArtifactIdentity — the family's cross-runtime artifact naming scheme", () => {
  it("slugs an ordinary method: camelCase to snake_case, lowercased", () => {
    const identity = artifactIdentityOfMethod("OrderServiceTest", "customerPlacesOrder");
    expect(fileSlug(identity)).toBe("customer_places_order");
  });

  it("builds the invocation tail as -<3-digit index>-<label>", () => {
    const identity = artifactIdentityOfInvocation(
      "CatalogTest",
      "equipmentCanBeFound",
      2,
      "find TENT",
    );
    expect(fileSlug(identity)).toBe("equipment_can_be_found-002-find_tent");
  });

  it("slugs a default JUnit-style bracketed display name readably", () => {
    const identity = artifactIdentityOfInvocation(
      "CatalogTest",
      "equipmentCanBeFound",
      1,
      "[1] KAYAK",
    );
    expect(fileSlug(identity)).toBe("equipment_can_be_found-001-1_kayak");
  });

  it("zero-pads a 4+ digit invocation index without truncating it", () => {
    const identity = artifactIdentityOfInvocation("BulkTest", "runsMany", 1234, "case");
    expect(fileSlug(identity)).toBe("runs_many-1234-case");
  });

  it("drops the label entirely when it slugs to nothing, keeping the index", () => {
    const identity = artifactIdentityOfInvocation("CatalogTest", "equipmentCanBeFound", 3, "!!!");
    expect(fileSlug(identity)).toBe("equipment_can_be_found-003");
  });

  it("never lets an ordinary method's slug collide with an invocation's — the separator cannot occur in either half", () => {
    const method = artifactIdentityOfMethod("Svc", "run");
    const invocation = artifactIdentityOfInvocation("Svc", "run", 1, "x");
    expect(fileSlug(method)).not.toContain("-");
    expect(fileSlug(invocation)).not.toBe(fileSlug(method));
  });

  it("gives two display names that differ only in path-unsafe characters different files", () => {
    const a = artifactIdentityOfInvocation("CatalogTest", "find", 1, "find/TENT");
    const b = artifactIdentityOfInvocation("CatalogTest", "find", 2, "find TENT");
    expect(fileSlug(a)).not.toBe(fileSlug(b));
  });

  it("is deterministic across repeated calls with the same identity", () => {
    const identity = artifactIdentityOfInvocation("Svc", "run", 2, "case B");
    expect(fileSlug(identity)).toBe(fileSlug({ ...identity }));
  });

  it("truncates a too-long method name on its own half, never the index or label", () => {
    const longMethod = `m${"x".repeat(400)}`;
    const identity = artifactIdentityOfInvocation("Svc", longMethod, 7, "case");
    const slug = fileSlug(identity);
    expect(slug.endsWith("-007-case")).toBe(true);
    expect(slug.length).toBeLessThan(260);
  });

  it("recognizes invocation vs. once-run identities", () => {
    expect(isInvocation(artifactIdentityOfMethod("Svc", "run"))).toBe(false);
    expect(isInvocation(artifactIdentityOfInvocation("Svc", "run", 1, "x"))).toBe(true);
  });

  it("rejects an invocation index below 1", () => {
    expect(() => artifactIdentityOfInvocation("Svc", "run", 0, "x")).toThrow(RangeError);
  });

  it("slugs the module (test class/file) into a safe directory name", () => {
    expect(moduleDirectorySlug(artifactIdentityOfMethod("traildepot.CatalogTest", "run"))).toBe(
      "traildepot.CatalogTest",
    );
  });

  describe("structuralScenario — value-free by construction", () => {
    it("titles an invocation as <humanized test name> #<index>, never the interpolated display name", () => {
      const identity = artifactIdentityOfInvocation(
        "CatalogTest",
        "equipmentCanBeFound",
        2,
        "find TENT",
      );
      expect(structuralScenario(identity, "find TENT")).toBe("Equipment can be found #2");
    });

    it("keeps the display name for a test that runs once", () => {
      const identity = artifactIdentityOfMethod("Svc", "customerPlacesOrder");
      expect(structuralScenario(identity, "customer places order")).toBe("customer places order");
    });

    it("falls back to the humanized test name when no display name is given", () => {
      const identity = artifactIdentityOfMethod("Svc", "customerPlacesOrder");
      expect(structuralScenario(identity)).toBe("Customer places order");
    });

    it("falls back to the humanized test name when the display name equals the test name", () => {
      const identity = artifactIdentityOfMethod("Svc", "customerPlacesOrder");
      expect(structuralScenario(identity, "customerPlacesOrder")).toBe("Customer places order");
    });

    it("strips a runner-appended bracket label from the bare test name before humanizing", () => {
      const identity: ArtifactIdentity = {
        moduleName: "Svc",
        testName: "equipmentCanBeFound[KAYAK]",
        invocationIndex: 0,
        invocationLabel: "",
      };
      expect(structuralScenario(identity, identity.testName)).toBe("Equipment can be found");
    });
  });
});
