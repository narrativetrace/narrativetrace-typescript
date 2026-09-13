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

  test("excludes build/ and coverage/ directories, not just node_modules and dist", () => {
    // .git, .turbo, and .stryker-tmp are also in EXCLUDED_DIRS, but every dot-prefixed directory
    // name is already excluded earlier (visitEntry's leading-dot check) regardless of this set's
    // membership — build/ and coverage/ are the entries that actually depend on it.
    write("package.json", "{}");
    write("build/bundled.ts", "should be excluded");
    write("coverage/report.ts", "should be excluded");
    const snapshot = buildSnapshot(dir, {});
    const paths = [...snapshot.sourceFiles.keys()];
    expect(paths.some((p) => p.includes("build/"))).toBe(false);
    expect(paths.some((p) => p.includes("coverage/"))).toBe(false);
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

  test("excludes a hidden file (other than .env) even when its extension looks like source", () => {
    write("package.json", "{}");
    write(".config.ts", "export const x = 1;");
    const snapshot = buildSnapshot(dir, {});
    expect(snapshot.sourceFiles.has(".config.ts")).toBe(false);
  });

  test("a .env file living under the configured output directory is still captured", () => {
    // .env is explicitly exempted from the leading-dot exclusion so that one sitting inside the
    // output or approved directory reaches the normal bucketing logic, instead of vanishing
    // silently the way every other dotfile does.
    write("package.json", "{}");
    write("narrativetrace-output/.env", "SECRET=xyz");
    const snapshot = buildSnapshot(dir, {});
    expect(snapshot.outputFiles.get("narrativetrace-output/.env")).toBe("SECRET=xyz");
  });

  test("excludes a file whose extension is not one of the recognized source extensions", () => {
    write("package.json", "{}");
    write("README.md", "# hello");
    const snapshot = buildSnapshot(dir, {});
    expect(snapshot.sourceFiles.has("README.md")).toBe(false);
    expect(snapshot.outputFiles.has("README.md")).toBe(false);
    expect(snapshot.approvedDirFiles.has("README.md")).toBe(false);
  });

  test("resolves @narrativetrace/core and @narrativetrace/core-node as base packages", () => {
    write("package.json", JSON.stringify({ name: "consumer" }));
    write(
      "node_modules/@narrativetrace/core/package.json",
      JSON.stringify({ name: "@narrativetrace/core", version: "0.1.3" }),
    );
    write(
      "node_modules/@narrativetrace/core-node/package.json",
      JSON.stringify({ name: "@narrativetrace/core-node", version: "0.1.3" }),
    );
    const snapshot = buildSnapshot(dir, {});
    expect(snapshot.installedPackages.get("@narrativetrace/core")?.version).toBe("0.1.3");
    expect(snapshot.installedPackages.get("@narrativetrace/core-node")?.version).toBe("0.1.3");
  });

  test("does not record an entry for a base package that fails to resolve", () => {
    write("package.json", JSON.stringify({ name: "consumer" }));
    const snapshot = buildSnapshot(dir, {});
    // Node's module resolution can still find a hoisted `vitest` above this temp directory in a
    // monorepo checkout, so assert on the packages that can never resolve from an isolated temp
    // dir rather than on the map's overall size.
    expect(snapshot.installedPackages.has("@narrativetrace/core")).toBe(false);
    expect(snapshot.installedPackages.has("@narrativetrace/core-node")).toBe(false);
    expect(snapshot.installedPackages.has("@narrativetrace/vitest")).toBe(false);
  });

  test("skips a non-@narrativetrace dependency of @narrativetrace/vitest even if it resolves", () => {
    write("package.json", JSON.stringify({ name: "consumer" }));
    write(
      "node_modules/@narrativetrace/vitest/package.json",
      JSON.stringify({
        name: "@narrativetrace/vitest",
        version: "0.1.3",
        dependencies: { "some-random-lib": "^1.0.0" },
      }),
    );
    write(
      "node_modules/some-random-lib/package.json",
      JSON.stringify({ name: "some-random-lib", version: "1.0.0" }),
    );
    const snapshot = buildSnapshot(dir, {});
    expect(snapshot.installedPackages.has("some-random-lib")).toBe(false);
  });

  test("does not record an entry for a sibling that fails to resolve", () => {
    write("package.json", JSON.stringify({ name: "consumer" }));
    write(
      "node_modules/@narrativetrace/vitest/package.json",
      JSON.stringify({
        name: "@narrativetrace/vitest",
        version: "0.1.3",
        dependencies: { "@narrativetrace/proxy": "0.1.3" },
      }),
    );
    // Deliberately no node_modules/@narrativetrace/proxy — it can never resolve.
    const snapshot = buildSnapshot(dir, {});
    expect(snapshot.installedPackages.has("@narrativetrace/proxy")).toBe(false);
  });

  test("caps at exactly MAX_FILES, not MAX_FILES + 1 — the inner break is off-by-one-sensitive", () => {
    // A dedicated, package.json-free subdirectory makes the visited count from the root's own
    // entries the only offset (exactly 1, for package.json itself) — enough to pin the exact
    // boundary and catch a `>` vs `>=` slip in the inner break, not just "some" truncation.
    write("package.json", "{}");
    mkdirSync(join(dir, "many"), { recursive: true });
    const total = 20_001;
    for (let i = 0; i < total; i++) {
      writeFileSync(join(dir, "many", `f${i}.ts`), "");
    }
    const snapshot = buildSnapshot(dir, {});
    expect(snapshot.sourceFiles.size).toBe(19_999);
  }, 30_000);

  test("caps the walk at MAX_FILES rather than visiting every entry in an oversized directory", () => {
    // Exercises the real MAX_FILES=20_000 safety bound end to end: a directory holding more than
    // the cap must be truncated, not fully walked — the only way to observe that the visited
    // counter genuinely counts up (and the inner break genuinely fires) rather than merely
    // existing. Asserts "clearly capped", not an exact count, since package.json itself consumes
    // one slot of the same budget and readdir order isn't guaranteed.
    write("package.json", "{}");
    const total = 20_050;
    for (let i = 0; i < total; i++) {
      writeFileSync(join(dir, `f${i}.ts`), "");
    }
    const snapshot = buildSnapshot(dir, {});
    expect(snapshot.sourceFiles.size).toBeGreaterThan(0);
    expect(snapshot.sourceFiles.size).toBeLessThan(total);
  }, 30_000);

  test("strips only a leading v from the reported Node version", () => {
    const original = process.version;
    Object.defineProperty(process, "version", { value: "20.11.v0", configurable: true });
    try {
      write("package.json", "{}");
      expect(buildSnapshot(dir, {}).nodeVersion).toBe("20.11.v0");
    } finally {
      Object.defineProperty(process, "version", { value: original, configurable: true });
    }
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
