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
      // Ratchet (raised 2026-09-13 with the mutation-score wave, floored at the actual value):
      // cli-bin.ts is now fully covered (__tests__/cli-bin.test.ts mocks runCli/buildSnapshot and
      // spies on process.exit/stdout/stderr). What remains below the shared 98% baseline is
      // environment.ts's two defensive catches (a readdir/read failing mid-walk from a permission
      // or race condition after the entry was already listed) — not reliably reproducible
      // cross-platform. Every reachable branch elsewhere in this package is at 100% — see the
      // per-file report in `pnpm --filter @narrativetrace/cli run coverage`.
      thresholds: { ...packageCoverage.thresholds, lines: 99, statements: 99, branches: 99 },
    },
  },
});
