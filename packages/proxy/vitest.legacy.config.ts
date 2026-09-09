// SPDX-License-Identifier: BUSL-1.1
// Licensed under the Business Source License 1.1 (see LICENSE); Change Date: four years from publication; Change License: Apache-2.0
// Copyright (c) 2026 Empower Agile
import { defineConfig } from "vitest/config";

/**
 * Second dialect leg of the decorator suite: the same tests, compiled with the legacy
 * `experimentalDecorators` dialect (the compilation NestJS and Angular projects use) instead of
 * the standard-TC39 default. esbuild — vitest's own transform — switches dialect from
 * `tsconfigRaw`, so this leg needs no extra compiler dependency.
 *
 * WHY IT EXISTS: the four decorators accept both call shapes at runtime, and a regression in
 * either dialect must fail CI — a legacy-dialect project's first decorator use erroring is
 * exactly the failure mode the dual-dialect contract kills. Wired into the package's `test` and
 * `coverage` scripts via `test:dialects` (no coverage collection here — this leg exists to run
 * the identical suite under the other compilation, not to re-measure line coverage).
 */
export default defineConfig({
  esbuild: {
    tsconfigRaw: '{"compilerOptions":{"experimentalDecorators":true}}',
  },
  test: {
    name: "proxy (experimentalDecorators dialect)",
    exclude: ["**/node_modules/**", "**/.stryker-tmp/**"],
    setupFiles: ["./__tests__/setup.ts"],
  },
});
