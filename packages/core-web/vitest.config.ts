// SPDX-License-Identifier: BUSL-1.1
// Licensed under the Business Source License 1.1 (see LICENSE); Change Date: four years from publication; Change License: Apache-2.0
// Copyright (c) 2026 Empower Agile
import { defineConfig } from "vitest/config";
import { packageCoverage, packageTestExclude } from "../../vitest.coverage.shared";

export default defineConfig({
  test: {
    // `browser-session.ts` reads `sessionStorage`, and its tests spy on
    // `Storage.prototype`. Same environment the other browser-flavoured
    // packages (`angular`, `react`, `react-router`) run under.
    environment: "jsdom",
    // The shared fragment already excludes node_modules and .stryker-tmp —
    // the same exclusion origin/main hardcoded here before the merge.
    exclude: packageTestExclude,
    coverage: packageCoverage,
  },
});
