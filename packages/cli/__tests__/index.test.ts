// SPDX-License-Identifier: BUSL-1.1
// Licensed under the Business Source License 1.1 (see LICENSE); Change Date: four years from publication; Change License: Apache-2.0
// Copyright (c) 2026 Empower Agile
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, test } from "vitest";
import {
  buildSnapshot,
  compareVersions,
  parseVersion,
  renderHuman,
  renderJson,
  runDoctor,
  satisfiesRange,
} from "../src/index.js";

// Exercises the package's public entry point end to end — not just the individual modules the
// other test files import directly — so the re-export surface itself is proven, not merely typed.

let dir: string;

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), "nt-doctor-index-"));
});

afterEach(() => {
  rmSync(dir, { recursive: true, force: true });
});

describe("public API surface", () => {
  test("buildSnapshot -> runDoctor -> render round-trips through the package root", () => {
    mkdirSync(dir, { recursive: true });
    writeFileSync(join(dir, "package.json"), JSON.stringify({ name: "consumer" }));
    const snapshot = buildSnapshot(dir, {});
    const report = runDoctor(snapshot);
    expect(renderHuman(report)).toContain("narrativetrace doctor");
    expect(JSON.parse(renderJson(report))).toEqual(report);
  });

  test("semver helpers are reachable from the package root", () => {
    expect(satisfiesRange("20.0.0", ">=20")).toBe(true);
    const a = parseVersion("2.0.0");
    const b = parseVersion("1.0.0");
    if (!a || !b) throw new Error("unparseable test fixture version");
    expect(compareVersions(a, b)).toBeGreaterThan(0);
  });
});
