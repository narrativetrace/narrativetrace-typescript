// SPDX-License-Identifier: BUSL-1.1
// Licensed under the Business Source License 1.1 (see LICENSE); Change Date: four years from publication; Change License: Apache-2.0
// Copyright (c) 2026 Empower Agile
import { defineConfig } from "vitest/config";
import { packageTestExclude } from "../../vitest.coverage.shared";

/**
 * Test-only, private, never published — a fuzz/property-test harness over every other package's
 * output surface, not a library with its own `src/`. Coverage thresholds do not apply: there is no
 * production code here to measure, only the corpus reader and oracle helpers this suite runs on
 * itself. `check` still runs `coverage` for this package (turbo does not distinguish), so coverage
 * stays enabled with no thresholds rather than being skipped, which would silently stop reporting
 * if `src/` ever grew one.
 */
export default defineConfig({
  test: {
    exclude: packageTestExclude,
    coverage: {
      provider: "v8",
      include: ["src/**"],
    },
  },
});
