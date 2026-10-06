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
      // Ratchet, inherited from `packages/cli` with the doctor itself (2026-09-26, the tooling
      // library split): raised above the shared 98% baseline and floored at the actual value.
      // What keeps it off 100 is two defensive catches of the same class, neither reliably
      // reproducible cross-platform: environment.ts's (a readdir/read failing mid-walk from a
      // permission or race condition after the entry was already listed) and init/files.ts's
      // present-but-unreadable branch (a path that stats as a regular file and then fails to open).
      // Every reachable branch elsewhere in this package is at 100% — see the per-file report in
      // `pnpm --filter @narrativetrace/tooling run coverage`.
      thresholds: { ...packageCoverage.thresholds, lines: 99, statements: 99, branches: 99 },
    },
  },
});
