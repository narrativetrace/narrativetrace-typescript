// SPDX-License-Identifier: BUSL-1.1
// Licensed under the Business Source License 1.1 (see LICENSE); Change Date: four years from publication; Change License: Apache-2.0
// Copyright (c) 2026 Empower Agile
import { describe, expect, it } from "vitest";
import {
  artifactIdentityOfInvocation,
  artifactIdentityOfMethod,
} from "../src/artifact-identity.js";
import { renderScenarioManifest } from "../src/scenario-manifest.js";

describe("renderScenarioManifest", () => {
  it("renders an empty scenario list", () => {
    expect(renderScenarioManifest([])).toBe(
      '{\n  "schema": "narrativetrace/scenario-manifest/1",\n  "scenarios": [\n\n  ]\n}\n',
    );
  });

  it("renders one once-run scenario without an invocation field", () => {
    const doc = renderScenarioManifest([
      {
        scenario: "Customer places order",
        identity: artifactIdentityOfMethod("OrderServiceTest", "customerPlacesOrder"),
        artifacts: new Map([
          ["trace", "OrderServiceTest/customer_places_order.md"],
          ["structural", "structural/OrderServiceTest/customer_places_order.nt"],
        ]),
      },
    ]);
    const parsed = JSON.parse(doc);
    expect(parsed.scenarios).toHaveLength(1);
    expect(parsed.scenarios[0]).toEqual({
      scenario: "Customer places order",
      testClass: "OrderServiceTest",
      testMethod: "customerPlacesOrder",
      artifacts: {
        trace: "OrderServiceTest/customer_places_order.md",
        structural: "structural/OrderServiceTest/customer_places_order.nt",
      },
    });
  });

  it("carries the invocation index for a parameterized invocation", () => {
    const doc = renderScenarioManifest([
      {
        scenario: "Equipment can be found #2",
        identity: artifactIdentityOfInvocation(
          "CatalogTest",
          "equipmentCanBeFound",
          2,
          "find TENT",
        ),
        artifacts: new Map([["trace", "x.md"]]),
      },
    ]);
    expect(JSON.parse(doc).scenarios[0].invocation).toBe(2);
  });

  it("escapes scenario names and paths that carry JSON-special characters", () => {
    const doc = renderScenarioManifest([
      {
        scenario: 'A "quoted" scenario',
        identity: artifactIdentityOfMethod("Svc", "run"),
        artifacts: new Map([["trace", "a\\b.md"]]),
      },
    ]);
    const parsed = JSON.parse(doc);
    expect(parsed.scenarios[0].scenario).toBe('A "quoted" scenario');
    expect(parsed.scenarios[0].artifacts.trace).toBe("a\\b.md");
  });

  // 2026-09-13 ruling, item 2: manifest.json gains a top-level `run` object beside `scenarios`.
  it("adds a top-level run object (id, name) beside scenarios when a run identity is given", () => {
    const doc = renderScenarioManifest(
      [
        {
          scenario: "Customer places order",
          identity: artifactIdentityOfMethod("OrderServiceTest", "customerPlacesOrder"),
          artifacts: new Map([["trace", "x.md"]]),
        },
      ],
      { id: "a1b2c3d4a1b2c3d4a1b2c3d4a1b2c3d4", name: "bold elk soars" },
    );
    const parsed = JSON.parse(doc);
    expect(parsed.run).toEqual({ id: "a1b2c3d4a1b2c3d4a1b2c3d4a1b2c3d4", name: "bold elk soars" });
    expect(parsed.scenarios).toHaveLength(1);
  });

  it("omits the run object entirely when no run identity is given", () => {
    const doc = renderScenarioManifest([]);
    expect(JSON.parse(doc)).not.toHaveProperty("run");
  });

  it("escapes a run id/name carrying JSON-special characters, same as every other field", () => {
    const doc = renderScenarioManifest([], { id: 'a"b', name: 'quoted "name"' });
    const parsed = JSON.parse(doc);
    expect(parsed.run).toEqual({ id: 'a"b', name: 'quoted "name"' });
  });
});
