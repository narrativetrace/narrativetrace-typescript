// SPDX-License-Identifier: BUSL-1.1
// Licensed under the Business Source License 1.1 (see LICENSE); Change Date: four years from publication; Change License: Apache-2.0
// Copyright (c) 2026 Empower Agile
import { defineConfig } from "vitest/config";
import { packageCoverage } from "../../vitest.coverage.shared";

export default defineConfig({
  test: {
    exclude: ["**/node_modules/**", "**/.stryker-tmp/**"],
    setupFiles: ["./__tests__/setup.ts"],
    coverage: {
      ...packageCoverage,
      // Ratchet (measured 2026-08-20, below the 98 baseline): floors at the
      // actual value rounded down — only move up. TODO Quality-gate item 2.
      thresholds: { ...packageCoverage.thresholds, branches: 93, lines: 97, statements: 97 },
    },
  },
});
