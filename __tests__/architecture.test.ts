// SPDX-License-Identifier: BUSL-1.1
// Licensed under the Business Source License 1.1 (see LICENSE); Change Date: four years from publication; Change License: Apache-2.0
// Copyright (c) 2026 Empower Agile
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { filesOfProject } from "tsarch";
import ts from "typescript";
import { describe, expect, test } from "vitest";

function sourceFiles(dir: string): string[] {
  const files: string[] = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) files.push(...sourceFiles(full));
    else if (entry.name.endsWith(".ts") && !entry.name.endsWith(".test.ts")) files.push(full);
  }
  return files;
}

function importsMatching(dir: string, pattern: RegExp): string[] {
  const violations: string[] = [];
  for (const file of sourceFiles(dir)) {
    const content = readFileSync(file, "utf-8");
    if (pattern.test(content)) violations.push(file);
  }
  return violations;
}

describe("architecture rules", () => {
  test("core must not import node:* modules", () => {
    const violations = importsMatching("packages/core/src", /from ["']node:/);
    expect(violations).toEqual([]);
  });

  test("proxy must not import node:* modules", () => {
    const violations = importsMatching("packages/proxy/src", /from ["']node:/);
    expect(violations).toEqual([]);
  });

  test("browser must not import node:* modules", () => {
    const violations = importsMatching("packages/browser/src", /from ["']node:/);
    expect(violations).toEqual([]);
  });

  test("core must not depend on core-node", async () => {
    const rule = filesOfProject("packages/core/tsconfig.json")
      .inFolder("packages/core/src")
      .shouldNot()
      .dependOnFiles()
      .inFolder("packages/core-node");

    const violations = await rule.check();
    expect(violations).toEqual([]);
  });

  test("core-web must not import node:* modules", () => {
    const violations = importsMatching("packages/core-web/src", /from ["']node:/);
    expect(violations).toEqual([]);
  });

  test("standalone must not import node:* modules", () => {
    const violations = importsMatching("packages/standalone/src", /from ["']node:/);
    expect(violations).toEqual([]);
  });

  test("angular must not import node:* modules", () => {
    const violations = importsMatching("packages/angular/src", /from ["']node:/);
    expect(violations).toEqual([]);
  });

  test("proxy must not depend on core-node", async () => {
    const rule = filesOfProject("packages/proxy/tsconfig.json")
      .inFolder("packages/proxy/src")
      .shouldNot()
      .dependOnFiles()
      .inFolder("packages/core-node");

    const violations = await rule.check();
    expect(violations).toEqual([]);
  });
}, 30_000);

// --- Layering contract (mirrors the Java module graph; canonical: the Java
// flagship's quality-tooling parity notes) ---
//
// Layers, bottom to top:
//   core                          — imports no other workspace package
//   clarity                       — core only
//   glossary, diagrams            — core + clarity
//   platform runtime              — core only. core-node/core-web are this
//     port's split of Java's single core module; proxy sits below the
//     adapters in Java too (junit5 depends on it); observability is the
//     shared log-field infrastructure the logging/HTTP adapters build on.
//   integrations (everything else) — core + platform runtime; never each
//     other, never the analysis layer (clarity/glossary/diagrams).
// Sanctioned exceptions, each pinned below in integrationAllowance():
//   vitest — composition-style test adapter, mirrors Java junit5 (which
//     depends on core, proxy, diagrams, clarity, glossary).
//   standalone — a bundler-only package: it re-exports browser, core-web and
//     proxy so tsup can inline them into one <script>-tag artifact. It ships
//     no logic of its own, so depending on an integration (browser) here is
//     the point rather than a layering leak.
//   security-tests — private, unpublished, test-only; mirrors Java's
//     narrativetrace-security-tests module, which depends on every module
//     that renders or emits (api, core, proxy, diagrams, glossary, clarity,
//     junit5, slf4j, opentelemetry) so one fuzz target can reach the whole
//     output surface. Sits one layer above vitest (needs its
//     writeTraceOutput/TraceFormat) as well as clarity/diagrams/glossary
//     directly.
//   react-router → react — a real integration→integration edge the contract
//     forbids. Scoped out here rather than "fixed" in product code.

const PLATFORM_RUNTIME = ["core-node", "core-web", "observability", "proxy"];

const LAYERED_ALLOWANCES: Record<string, string[]> = {
  clarity: ["core"],
  core: [],
  diagrams: ["clarity", "core"],
  glossary: ["clarity", "core"],
  ...Object.fromEntries(PLATFORM_RUNTIME.map((pkg) => [pkg, ["core"]])),
};

function integrationAllowance(pkg: string): string[] {
  const base = ["core", ...PLATFORM_RUNTIME];
  if (pkg === "vitest") return [...base, "clarity", "diagrams", "glossary"];
  if (pkg === "security-tests") return [...base, "clarity", "diagrams", "glossary", "vitest"];
  if (pkg === "react-router") return [...base, "react"];
  if (pkg === "standalone") return [...base, "browser"];
  return base;
}

function allowedImports(pkg: string): string[] {
  return LAYERED_ALLOWANCES[pkg] ?? integrationAllowance(pkg);
}

function workspacePackages(): string[] {
  return readdirSync("packages", { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name)
    .sort();
}

/** The specifier of `node`, when the node is one of the four things that create an edge. */
function specifierOf(node: ts.Node): string | undefined {
  if (ts.isImportDeclaration(node) || ts.isExportDeclaration(node)) {
    const from = node.moduleSpecifier;
    return from && ts.isStringLiteral(from) ? from.text : undefined;
  }
  if (!ts.isCallExpression(node)) return undefined;
  const dynamic =
    node.expression.kind === ts.SyntaxKind.ImportKeyword ||
    (ts.isIdentifier(node.expression) && node.expression.text === "require");
  const first = node.arguments[0];
  return dynamic && first && ts.isStringLiteral(first) ? first.text : undefined;
}

/**
 * Every module `file` imports, from the AST rather than from a text match.
 *
 * INTENT: a specifier is an edge only when something IMPORTS it. The text match this replaced
 * counted any quoted `@narrativetrace/…` as a dependency, so `packages/skills` — whose whole
 * content is instructions naming packages a user should install, example imports included — read
 * as depending on every package it documents.
 */
function moduleSpecifiers(file: string): string[] {
  const source = ts.createSourceFile(
    file,
    readFileSync(file, "utf-8"),
    ts.ScriptTarget.Latest,
    true,
  );
  const specifiers: string[] = [];
  const visit = (node: ts.Node): void => {
    const specifier = specifierOf(node);
    if (specifier !== undefined) specifiers.push(specifier);
    ts.forEachChild(node, visit);
  };
  visit(source);
  return specifiers;
}

function observedImports(pkg: string): Set<string> {
  const srcDir = join("packages", pkg, "src");
  const found = new Set<string>();
  if (!existsSync(srcDir)) return found;
  const scope = "@narrativetrace/";
  for (const file of sourceFiles(srcDir)) {
    for (const specifier of moduleSpecifiers(file)) {
      const name = specifier.startsWith(scope) ? specifier.slice(scope.length) : undefined;
      if (name !== undefined && name !== pkg) found.add(name);
    }
  }
  return found;
}

function declaredImports(pkg: string): Set<string> {
  const manifestPath = join("packages", pkg, "package.json");
  const manifest = JSON.parse(readFileSync(manifestPath, "utf-8"));
  // Production contract only: devDependencies carry test-harness wiring.
  const names = Object.keys({ ...manifest.dependencies, ...manifest.peerDependencies });
  const scope = "@narrativetrace/";
  return new Set(names.filter((n) => n.startsWith(scope)).map((n) => n.slice(scope.length)));
}

function forbiddenEdges(pkg: string): string[] {
  const allowed = allowedImports(pkg);
  const edges = new Set([...observedImports(pkg), ...declaredImports(pkg)]);
  return [...edges].filter((dep) => !allowed.includes(dep)).sort();
}

describe("architecture layering", () => {
  for (const pkg of workspacePackages()) {
    test(`${pkg} imports only lower layers (allowed: ${allowedImports(pkg).join(", ") || "none"})`, () => {
      expect(forbiddenEdges(pkg)).toEqual([]);
    });
  }
}, 30_000);
