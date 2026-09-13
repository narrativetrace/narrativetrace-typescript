// SPDX-License-Identifier: BUSL-1.1
// Licensed under the Business Source License 1.1 (see LICENSE); Change Date: four years from publication; Change License: Apache-2.0
// Copyright (c) 2026 Empower Agile
import { mkdirSync, mkdtempSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, test } from "vitest";
import { buildSnapshot } from "../src/doctor/environment.js";

let dir: string;

function write(relativePath: string, content: string): void {
  const full = join(dir, relativePath);
  mkdirSync(join(full, ".."), { recursive: true });
  writeFileSync(full, content);
}

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), "nt-doctor-"));
});

afterEach(() => {
  rmSync(dir, { recursive: true, force: true });
});

describe("buildSnapshot", () => {
  test("reads the root package.json and stamps the running Node version", () => {
    write("package.json", JSON.stringify({ name: "consumer", type: "module" }));
    const snapshot = buildSnapshot(dir, {});
    expect(snapshot.rootPackageJson).toEqual({ name: "consumer", type: "module" });
    expect(snapshot.nodeVersion).toBe(process.version.replace(/^v/, ""));
  });

  test("returns undefined rootPackageJson when none exists", () => {
    expect(buildSnapshot(dir, {}).rootPackageJson).toBeUndefined();
  });

  test("buckets source files by extension, excluding node_modules and dist", () => {
    write("package.json", "{}");
    write("src/index.ts", "export const x = 1;");
    write("src/order.test.ts", "test content");
    write("node_modules/dep/index.js", "should be excluded");
    write("dist/bundled.js", "should be excluded");
    const snapshot = buildSnapshot(dir, {});
    expect(snapshot.sourceFiles.get("src/index.ts")).toBe("export const x = 1;");
    expect(snapshot.sourceFiles.get("src/order.test.ts")).toBe("test content");
    expect([...snapshot.sourceFiles.keys()].some((p) => p.includes("node_modules"))).toBe(false);
    expect([...snapshot.sourceFiles.keys()].some((p) => p.includes("dist/"))).toBe(false);
  });

  test("routes the output directory and approved directory into their own buckets", () => {
    write("package.json", "{}");
    write("narrativetrace-output/trace.md", "rendered trace");
    write("narratives/order.approved.nt", "approved content");
    const snapshot = buildSnapshot(dir, {});
    expect(snapshot.outputFiles.get("narrativetrace-output/trace.md")).toBe("rendered trace");
    expect(snapshot.approvedDirFiles.get("narratives/order.approved.nt")).toBe("approved content");
    expect(snapshot.sourceFiles.has("narrativetrace-output/trace.md")).toBe(false);
  });

  test("honors NARRATIVETRACE_OUTPUT_DIR and NARRATIVETRACE_APPROVED_DIR overrides", () => {
    write("package.json", "{}");
    write("custom-output/trace.md", "rendered trace");
    write("custom-approved/order.approved.nt", "approved content");
    const snapshot = buildSnapshot(dir, {
      NARRATIVETRACE_OUTPUT_DIR: "custom-output",
      NARRATIVETRACE_APPROVED_DIR: "custom-approved",
    });
    expect(snapshot.outputFiles.get("custom-output/trace.md")).toBe("rendered trace");
    expect(snapshot.approvedDirFiles.get("custom-approved/order.approved.nt")).toBe(
      "approved content",
    );
  });

  test("resolves an installed package's package.json from the consumer root", () => {
    write("package.json", JSON.stringify({ name: "consumer" }));
    write("node_modules/vitest/package.json", JSON.stringify({ name: "vitest", version: "3.2.0" }));
    const snapshot = buildSnapshot(dir, {});
    expect(snapshot.installedPackages.get("vitest")).toEqual({
      name: "vitest",
      version: "3.2.0",
    });
  });

  test("skips a dangling symlink rather than throwing (survives an unstattable entry)", () => {
    write("package.json", "{}");
    write("src/index.ts", "export const x = 1;");
    symlinkSync(join(dir, "does-not-exist"), join(dir, "src", "broken-link.ts"));
    const snapshot = buildSnapshot(dir, {});
    expect(snapshot.sourceFiles.get("src/index.ts")).toBe("export const x = 1;");
    expect(snapshot.sourceFiles.has("src/broken-link.ts")).toBe(false);
  });

  test("resolves @narrativetrace/vitest's siblings dynamically from its own dependencies field", () => {
    write("package.json", JSON.stringify({ name: "consumer" }));
    write(
      "node_modules/@narrativetrace/vitest/package.json",
      JSON.stringify({
        name: "@narrativetrace/vitest",
        version: "0.1.3",
        dependencies: { "@narrativetrace/proxy": "0.1.3" },
      }),
    );
    write(
      "node_modules/@narrativetrace/proxy/package.json",
      JSON.stringify({ name: "@narrativetrace/proxy", version: "0.1.3" }),
    );
    const snapshot = buildSnapshot(dir, {});
    expect(snapshot.installedPackages.get("@narrativetrace/proxy")?.version).toBe("0.1.3");
  });
});
