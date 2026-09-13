// SPDX-License-Identifier: BUSL-1.1
// Licensed under the Business Source License 1.1 (see LICENSE); Change Date: four years from publication; Change License: Apache-2.0
// Copyright (c) 2026 Empower Agile
import { defineConfig } from "vitest/config";
import { packageCoverage } from "../../vitest.coverage.shared";

export default defineConfig({
  test: {
    exclude: ["**/node_modules/**", "**/.stryker-tmp/**"],
    coverage: {
      ...packageCoverage,
      // Ratchet (measured 2026-09-12, floored at the actual value): cli-bin.ts is an untested
      // shebang wrapper (same shape as clarity-bin.ts and approve-narratives-bin.ts, which stay
      // untested there too — those packages are just large enough for the rest of their coverage
      // to absorb it); environment.ts carries two defensive catches (a readdir/read failing mid-
      // walk from a permission or race condition after the entry was already listed) that are not
      // reliably reproducible cross-platform. Every reachable branch elsewhere in this package is
      // at 100% — see the per-file report in `pnpm --filter @narrativetrace/cli run coverage`.
      thresholds: { ...packageCoverage.thresholds, lines: 97, statements: 97, branches: 96 },
    },
  },
});
