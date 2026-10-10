// SPDX-License-Identifier: BUSL-1.1
// Licensed under the Business Source License 1.1 (see LICENSE); Change Date: four years from publication; Change License: Apache-2.0
// Copyright (c) 2026 Empower Agile
import { describe, expect, test } from "vitest";
import { frameworkCheck } from "../../src/doctor/checks/framework-wiring.js";
import { DOCTOR_CHECKS, runDoctor } from "../../src/doctor/doctor.js";
import type { DoctorSnapshot, PackageJsonLike } from "../../src/doctor/types.js";
import { DOCTOR_REPORT_FIELD, valueFreeViolations } from "../../src/feedback/value-free-check.js";
import { VERSION_PLACEHOLDER } from "../../src/frameworks/framework-detection.js";
import type { FrameworkRow } from "../../src/frameworks/framework-row.js";
import { FRAMEWORK_ROWS, frameworkRowById } from "../../src/frameworks/framework-table.js";
import { wiringSnippet } from "../../src/frameworks/wiring-snippets.js";
import { pkg, snapshot, withFiles, withPackages } from "../fixture.js";

function row(id: string): FrameworkRow {
  const found = frameworkRowById(id);
  if (!found) throw new Error(`no row ${id}`);
  return found;
}

/** Rows that earn a check of their own and ship something to wire. */
const WIRED_ROWS = FRAMEWORK_ROWS.filter((r) => r.check.kind === "wiring-check");
const NO_INTEGRATION_ROWS = FRAMEWORK_ROWS.filter((r) => r.check.kind === "no-integration");

function declaring(...names: string[]): ReadonlyMap<string, PackageJsonLike> {
  const dependencies = Object.fromEntries(names.map((name) => [name, "*"]));
  return new Map([["package.json", pkg({ dependencies })]]);
}

function project(manifests: ReadonlyMap<string, PackageJsonLike>, files = {}): DoctorSnapshot {
  return snapshot({ manifests, sourceFiles: withFiles(files) });
}

function fixtureOf(r: FrameworkRow): string {
  if (r.wiring.kind !== "snippet") throw new Error(`${r.id} has no snippet`);
  return r.wiring.fixture;
}

function frameworkOf(r: FrameworkRow): string {
  return r.marker.packages[0] as string;
}

function integrationOf(r: FrameworkRow): string {
  return r.module?.packages[0] as string;
}

describe("frameworkCheck — a row with source-level wiring", () => {
  test.each(
    WIRED_ROWS.map((r) => [r.id, r] as const),
  )("%s: passes a project that neither uses the framework nor references the module", (_id, r) => {
    const finding = frameworkCheck(r)(project(declaring("lodash")));
    expect(finding.status).toBe("pass");
    expect(finding.id).toBe(r.check.id);
    expect(finding.message).toBe(`${r.name} not detected — nothing to wire`);
  });

  test.each(
    WIRED_ROWS.map((r) => [r.id, r] as const),
  )("%s: fails a project that uses the framework but never installed the integration", (_id, r) => {
    const finding = frameworkCheck(r)(project(declaring(frameworkOf(r))));
    expect(finding.status).toBe("fail");
    expect(finding.message).toBe(
      `${r.name} detected (${r.marker.description}) but ${integrationOf(r)} is not installed — nothing in it is traced`,
    );
    expect(finding.fix).toContain(`Add ${integrationOf(r)} — `);
    expect(finding.fix.endsWith(wiringSnippet(fixtureOf(r)))).toBe(true);
  });

  test.each(
    WIRED_ROWS.map((r) => [r.id, r] as const),
  )("%s: fails a project that installed the integration but never wired it", (_id, r) => {
    const finding = frameworkCheck(r)(project(declaring(frameworkOf(r), integrationOf(r))));
    expect(finding.status).toBe("fail");
    expect(finding.message).toBe(
      `${integrationOf(r)} is installed but its wiring (${r.wiring.description}) is never applied — nothing in it is traced`,
    );
    expect(finding.fix.startsWith("Apply the wiring: add ")).toBe(true);
    expect(finding.fix.endsWith(wiringSnippet(fixtureOf(r)))).toBe(true);
    expect(finding.fix).not.toContain(" install ");
  });

  test.each(
    WIRED_ROWS.map((r) => [r.id, r] as const),
  )("%s: the fix it prints is the fix it accepts — install line plus the snippet, dropped in", (_id, r) => {
    const installed = [frameworkOf(r), ...(r.module?.packages ?? [])];
    const finding = frameworkCheck(r)(
      project(declaring(...installed), { "src/wiring.ts": wiringSnippet(fixtureOf(r)) }),
    );
    expect(finding.status).toBe("pass");
    expect(finding.message).toBe(`${integrationOf(r)} is wired: ${r.wiring.description}`);
  });

  test("still fails a referenced integration while the only wiring is commented out", () => {
    const commented = wiringSnippet(fixtureOf(row("express")))
      .split("\n")
      .map((line) => `// ${line}`)
      .join("\n");
    const finding = frameworkCheck(row("express"))(
      project(declaring("express", "@narrativetrace/express"), { "src/app.ts": commented }),
    );
    expect(finding.status).toBe("fail");
  });

  test("a module referenced without the framework is still held to its wiring", () => {
    const finding = frameworkCheck(row("express"))(project(declaring("@narrativetrace/express")));
    expect(finding.status).toBe("fail");
  });

  test("reads the framework from a workspace member's manifest, not only the root's", () => {
    const manifests = withPackages({
      "package.json": pkg({ name: "monorepo" }),
      "apps/api/package.json": pkg({ devDependencies: { express: "5" } }),
    });
    expect(frameworkCheck(row("express"))(project(manifests)).status).toBe("fail");
  });

  test("prints the install line for the project's own package manager and version", () => {
    const finding = frameworkCheck(row("express"))(
      snapshot({
        manifests: declaring("express"),
        packageManager: "pnpm",
        installedPackages: withPackages({ "@narrativetrace/core-node": pkg({ version: "4.5.6" }) }),
      }),
    );
    expect(finding.fix).toContain("pnpm add @narrativetrace/express@4.5.6 ");
  });

  test("pins to a placeholder rather than guessing a version it cannot read", () => {
    const finding = frameworkCheck(row("express"))(project(declaring("express")));
    expect(finding.fix).toContain(`npm install @narrativetrace/express@${VERSION_PLACEHOLDER} `);
  });

  test("tags every finding with its row, so a report can be filtered to framework checks", () => {
    expect(frameworkCheck(row("hono"))(project(declaring())).framework).toBe("hono");
    expect(frameworkCheck(row("hono"))(project(declaring("hono"))).framework).toBe("hono");
  });
});

describe("frameworkCheck — a framework with no integration shipped", () => {
  test.each(
    NO_INTEGRATION_ROWS.map((r) => [r.id, r] as const),
  )("%s: reports the framework and says to leave it alone, never failing", (_id, r) => {
    const finding = frameworkCheck(r)(project(declaring(frameworkOf(r))));
    expect(finding.status).toBe("pass");
    expect(finding.message).toBe(
      `${r.name} detected (${r.marker.description}) — no NarrativeTrace integration is shipped for it: nothing to wire, leave it alone and trace the project's own services with traceObject`,
    );
    expect(finding.framework).toBe(r.id);
  });

  test.each(
    NO_INTEGRATION_ROWS.map((r) => [r.id, r] as const),
  )("%s: says nothing to report when the framework is absent", (_id, r) => {
    const finding = frameworkCheck(r)(project(declaring("express")));
    expect(finding.status).toBe("pass");
    expect(finding.message).toBe(`${r.name} not detected — nothing to report`);
  });
});

describe("frameworkCheck — guards", () => {
  test("refuses the row an existing check covers: it has no check of its own", () => {
    expect(() => frameworkCheck(row("default-logger"))).toThrow(
      "row default-logger is covered by trap.silent-sink, not a check of its own",
    );
  });
});

describe("the doctor with the framework table", () => {
  test("runs one check per row the table gives a check of its own, after the existing thirteen", () => {
    const ids = runDoctor(snapshot()).findings.map((finding) => finding.id);
    const own = FRAMEWORK_ROWS.filter((r) => r.check.kind !== "existing-check").map(
      (r) => r.check.id,
    );
    expect(ids.slice(13)).toEqual(own);
    expect(DOCTOR_CHECKS).toHaveLength(13 + own.length);
  });

  test.each([
    ["every framework detected, nothing installed", (r: FrameworkRow) => [frameworkOf(r)]],
    [
      "every integration installed, nothing wired",
      (r: FrameworkRow) => [frameworkOf(r), ...(r.module?.packages ?? [])],
    ],
  ])("a report with %s still passes the feedback value-free gate", (_name, declared) => {
    const names = FRAMEWORK_ROWS.flatMap((r) => (r.marker.packages.length ? declared(r) : []));
    const report = runDoctor(project(declaring(...names)));
    expect(report.findings.filter((f) => f.framework && f.status === "fail")).toHaveLength(
      WIRED_ROWS.length,
    );
    const fields = new Map([[DOCTOR_REPORT_FIELD, JSON.stringify(report, null, 2)]]);
    expect(valueFreeViolations(fields).map((v) => v.rule.id)).toEqual([]);
  });
});
