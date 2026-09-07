// SPDX-License-Identifier: BUSL-1.1
// Licensed under the Business Source License 1.1 (see LICENSE); Change Date: four years from publication; Change License: Apache-2.0
// Copyright (c) 2026 Empower Agile
import swc from "unplugin-swc";
import { defineConfig } from "vitest/config";
import { packageCoverage } from "../../vitest.coverage.shared";

export default defineConfig({
  test: {
    setupFiles: ["./__tests__/setup.ts"],
    exclude: ["**/node_modules/**", "**/.stryker-tmp/**"],
    coverage: {
      ...packageCoverage,
      // Ratchet (measured 2026-08-20, below the 98 baseline): floors at the
      // actual value rounded down — only move up. TODO Quality-gate item 2.
      thresholds: {
        ...packageCoverage.thresholds,
        branches: 89,
        functions: 96,
        lines: 94,
        statements: 94,
      },
    },
  },
  plugins: [
    swc.vite({
      module: { type: "es6" },
      jsc: {
        target: "es2022",
        parser: { syntax: "typescript", decorators: true },
        transform: { legacyDecorator: true, decoratorMetadata: true },
      },
    }),
  ],
});
