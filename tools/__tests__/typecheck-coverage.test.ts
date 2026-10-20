// SPDX-License-Identifier: BUSL-1.1
// Licensed under the Business Source License 1.1 (see LICENSE); Change Date: four years from publication; Change License: Apache-2.0
// Copyright (c) 2026 Empower Agile
import { readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import ts from "typescript";
import { describe, expect, it } from "vitest";

const repoRoot = resolve(import.meta.dirname, "../..");

function sourceFilesUnder(dir: string): string[] {
  return ts.sys
    .readDirectory(join(repoRoot, dir), [".ts"], ["**/node_modules/**", "**/fixtures/**"])
    .map((file) => resolve(file));
}

function fileNamesOf(tsconfigPath: string): string[] {
  const read = ts.readConfigFile(tsconfigPath, ts.sys.readFile);
  const parsed = ts.parseJsonConfigFileContent(read.config, ts.sys, dirname(tsconfigPath));
  return parsed.fileNames.map((file) => resolve(file));
}

// Every tsconfig the gate typechecks: each package's own (`pnpm run build`, tsup's dts pass) plus
// every `-p <path>` the root `typecheck` script runs (`pnpm run check`).
function gateTsconfigs(): string[] {
  const scripts = (
    JSON.parse(readFileSync(join(repoRoot, "package.json"), "utf-8")) as {
      scripts: Record<string, string>;
    }
  ).scripts;
  const explicit = [...(scripts.typecheck ?? "").matchAll(/-p (\S+)/g)].map((m) =>
    join(repoRoot, m[1] ?? ""),
  );
  const packages = ts.sys
    .readDirectory(
      join(repoRoot, "packages"),
      [".json"],
      ["**/node_modules/**"],
      ["*/tsconfig.json"],
    )
    .map((file) => resolve(file));
  return [...packages, ...explicit];
}

describe("the gate typechecks every tree that holds TypeScript", () => {
  it("includes the evals, tools and proxy test files in some gate tsconfig", () => {
    const covered = new Set(gateTsconfigs().flatMap(fileNamesOf));
    const trees = ["packages/skills-catalogue/evals", "tools", "packages/proxy/__tests__"];
    const uncovered = trees
      .flatMap(sourceFilesUnder)
      .filter((file) => !covered.has(file))
      .map((file) => file.slice(repoRoot.length + 1));
    expect(uncovered).toEqual([]);
  });

  it("wires the typecheck script into pnpm run check", () => {
    const scripts = (
      JSON.parse(readFileSync(join(repoRoot, "package.json"), "utf-8")) as {
        scripts: Record<string, string>;
      }
    ).scripts;
    expect(scripts.check).toMatch(/pnpm run typecheck\b/);
  });
});
