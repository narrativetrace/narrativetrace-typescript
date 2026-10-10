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
  FRAMEWORK_ROWS,
  frameworkCheck,
  frameworkCheckIds,
  frameworkRowById,
  parseVersion,
  renderHuman,
  renderJson,
  runDoctor,
  satisfiesRange,
} from "../src/index.js";

// Exercises the package's public entry point end to end — not just the individual modules the
// other test files import directly — so the re-export surface itself is proven, not merely typed.
// `@narrativetrace/cli` reaches the doctor through exactly these names.

let dir: string;

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), "nt-tooling-index-"));
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

describe("the framework table through the entry point", () => {
  test("a real Express project without the integration fails its row's check, end to end", () => {
    writeFileSync(join(dir, "package.json"), JSON.stringify({ dependencies: { express: "5" } }));
    const report = runDoctor(buildSnapshot(dir, {}));
    const express = report.findings.find((finding) => finding.id === "config.express-middleware");
    expect(express?.status).toBe("fail");
    expect(express?.framework).toBe("express");
    expect(renderJson(report)).toContain('"framework": "express"');
  });

  test("exports the rows, their ids and the check factory the doctor itself uses", () => {
    expect(FRAMEWORK_ROWS.length).toBeGreaterThan(0);
    expect(frameworkCheckIds()).toContain("config.express-middleware");
    const row = frameworkRowById("hono");
    if (!row) throw new Error("the table has a hono row");
    expect(frameworkCheck(row)(buildSnapshot(dir, {})).id).toBe("config.hono-middleware");
  });
});
