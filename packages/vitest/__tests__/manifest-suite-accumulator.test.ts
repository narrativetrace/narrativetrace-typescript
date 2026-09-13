// SPDX-License-Identifier: BUSL-1.1
// Licensed under the Business Source License 1.1 (see LICENSE); Change Date: four years from publication; Change License: Apache-2.0
// Copyright (c) 2026 Empower Agile
import { artifactIdentityOfMethod, type ScenarioManifestEntry } from "@narrativetrace/core-node";
import { afterEach, describe, expect, test } from "vitest";
import {
  drainManifestEntries,
  manifestEntryCount,
  recordManifestEntry,
  writeSuiteManifest,
} from "../src/manifest-suite-accumulator.js";

function entry(scenario: string, testMethod = "run"): ScenarioManifestEntry {
  return {
    scenario,
    identity: artifactIdentityOfMethod("SvcTest", testMethod),
    artifacts: new Map([["trace", `SvcTest/${testMethod}.md`]]),
  };
}

function memFs() {
  const writes: Record<string, string> = {};
  return {
    writes,
    mkdir: () => {},
    writeFile: (path: string, content: string) => {
      writes[path] = content;
    },
  };
}

afterEach(() => {
  drainManifestEntries();
});

describe("manifest entry registry", () => {
  test("records and drains entries in insertion order, retaining duplicates", () => {
    recordManifestEntry(entry("A"));
    recordManifestEntry(entry("A"));
    recordManifestEntry(entry("B"));
    expect(manifestEntryCount()).toBe(3);
    const drained = drainManifestEntries();
    expect(drained.map((e) => e.scenario)).toStrictEqual(["A", "A", "B"]);
    // Draining empties the registry.
    expect(manifestEntryCount()).toBe(0);
  });
});

describe("writeSuiteManifest", () => {
  test("empty suite writes nothing", () => {
    const fs = memFs();
    const outcome = writeSuiteManifest([], "out", fs);
    expect(outcome.written).toBe(false);
    expect(Object.keys(fs.writes)).toHaveLength(0);
  });

  test("writes one manifest.json with every entry, in order", () => {
    const fs = memFs();
    const outcome = writeSuiteManifest([entry("A"), entry("B", "other")], "out", fs);
    expect(outcome.written).toBe(true);
    expect(outcome.path).toBe("out/manifest.json");
    const json = JSON.parse(fs.writes["out/manifest.json"] as string);
    expect(json.scenarios.map((s: { scenario: string }) => s.scenario)).toStrictEqual(["A", "B"]);
    expect(json).not.toHaveProperty("run");
  });

  // 2026-09-13 ruling, item 2: the run's own id/name ride along as a top-level `run` object.
  test("includes the run's id/name as a top-level object when a run identity is given", () => {
    const fs = memFs();
    writeSuiteManifest([entry("A")], "out", fs, {
      id: "a1b2c3d4a1b2c3d4a1b2c3d4a1b2c3d4",
      name: "bold elk soars",
    });
    const json = JSON.parse(fs.writes["out/manifest.json"] as string);
    expect(json.run).toEqual({ id: "a1b2c3d4a1b2c3d4a1b2c3d4a1b2c3d4", name: "bold elk soars" });
  });
});
