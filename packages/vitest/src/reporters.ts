// SPDX-License-Identifier: BUSL-1.1
// Licensed under the Business Source License 1.1 (see LICENSE); Change Date: four years from publication; Change License: Apache-2.0
// Copyright (c) 2026 Empower Agile
// Reporter-only entry point — deliberately separate from index.ts.
//
// index.ts imports `test` from "vitest" at module scope (for the `narrativeTest` fixture), and
// that import is only safe inside a running test file. `vitest.config.ts` is loaded by Vite in a
// context that exists *before* the test runtime is set up — a static or dynamic import of the
// "vitest" package there throws "Vitest failed to access its internal state", regardless of vitest
// version (1.x, 2.x and 3.x all fail identically; this is a Vite/Vitest constraint, not a
// version-compatibility gap). But registering a suite reporter is exactly a `vitest.config.ts`
// operation — `reporters: ["default", new ClaritySuiteReporter()]` — so importing the reporter
// classes from the main "@narrativetrace/vitest" entry point breaks the one place they are meant
// to be used.
//
// This module re-exports only the reporter classes, from files that never import "vitest" at
// runtime (the `declare module "vitest" { interface TaskMeta {...} }` augmentation in
// clarity-suite-reporter.ts/glossary-suite-reporter.ts is a type-only declaration, erased by the
// compiler — it emits no import). Import reporters from here in `vitest.config.ts`; import the
// test fixtures (`narrativeTest`, `createNarrativeTest`) from the main entry point in test files.
export {
  ClaritySuiteReporter,
  type ClaritySuiteReporterOptions,
  collectClarityEntries,
} from "./clarity-suite-reporter.js";
export { ConsoleSummaryReporter } from "./console-summary-reporter.js";
export {
  GlossarySuiteReporter,
  type GlossarySuiteReporterOptions,
  glossaryHarvestEnabled,
} from "./glossary-suite-reporter.js";
