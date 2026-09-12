// SPDX-License-Identifier: BUSL-1.1
// Licensed under the Business Source License 1.1 (see LICENSE); Change Date: four years from publication; Change License: Apache-2.0
// Copyright (c) 2026 Empower Agile
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, test } from "vitest";
import {
  ClaritySuiteReporter,
  ConsoleSummaryReporter,
  collectClarityEntries,
  GlossarySuiteReporter,
  glossaryHarvestEnabled,
} from "../src/reporters.js";

// `../src/index.ts` imports `test` from "vitest" at module scope, which is only safe inside a
// running test file — `vitest.config.ts` is loaded by Vite *before* the test runtime exists, and
// importing "vitest" there throws "Vitest failed to access its internal state" on every Vitest
// version (1.x, 2.x, 3.x alike; verified against all three during onboarding hardening,
// 2026-09-12). `reporters.ts` exists so `vitest.config.ts` can register a suite reporter without
// pulling that import in. These tests pin both halves of that contract.
describe("the reporters entry point", () => {
  test("exposes the suite reporter classes and helpers", () => {
    expect(ClaritySuiteReporter).toBeTypeOf("function");
    expect(GlossarySuiteReporter).toBeTypeOf("function");
    expect(ConsoleSummaryReporter).toBeTypeOf("function");
    expect(collectClarityEntries).toBeTypeOf("function");
    expect(glossaryHarvestEnabled).toBeTypeOf("function");
  });

  test("instantiates without throwing outside of a test run", () => {
    expect(() => new ClaritySuiteReporter({ outputDir: "/dev/null" })).not.toThrow();
    expect(() => new GlossarySuiteReporter({ enabled: false })).not.toThrow();
  });
});

// A regression guard, not a behavioral test: reporters.ts and everything it re-exports from must
// never gain a runtime import of "vitest" (or of "./index.js", which has one) — that is exactly
// the shape of the bug this file exists to prevent. `declare module "vitest" { ... }` type
// augmentations are fine; they compile to nothing.
describe('no runtime import of "vitest" reaches the reporters entry point', () => {
  const REPORTER_SOURCE_FILES = [
    "../src/reporters.ts",
    "../src/clarity-suite-reporter.ts",
    "../src/glossary-suite-reporter.ts",
    "../src/console-summary-reporter.ts",
    "../src/suite-clarity-accumulator.ts",
  ];

  const RUNTIME_VITEST_IMPORT = /^\s*import\b[^;]*\bfrom\s+["']vitest["']/m;
  const INDEX_IMPORT = /^\s*import\b[^;]*\bfrom\s+["']\.\/index\.js["']/m;

  test.each(REPORTER_SOURCE_FILES)("%s has no runtime import of vitest or ./index.js", (rel) => {
    const path = fileURLToPath(new URL(rel, import.meta.url));
    const source = readFileSync(path, "utf-8");
    expect(source).not.toMatch(RUNTIME_VITEST_IMPORT);
    expect(source).not.toMatch(INDEX_IMPORT);
  });
});
