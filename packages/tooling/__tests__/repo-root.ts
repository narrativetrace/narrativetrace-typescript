// SPDX-License-Identifier: BUSL-1.1
// Licensed under the Business Source License 1.1 (see LICENSE); Change Date: four years from publication; Change License: Apache-2.0
// Copyright (c) 2026 Empower Agile
import { existsSync } from "node:fs";
import { join } from "node:path";

/**
 * Tests that reach outside this package — the REAL checked-in carrier under `packages/skills`, the
 * copy bundled in `packages/cli` — assume `import.meta.dirname` sits at the package's real,
 * checked-out location. Stryker's sandbox copies only the PACKAGE directory into
 * `.stryker-tmp/sandbox-*` (see the `vitest.coverage.shared.ts` symlink's own comment for the
 * identical problem), and from inside it those paths simply are not there. `REACHABLE` lets the
 * handful of cases that need the real repository skip cleanly under that sandbox instead of failing
 * Stryker's initial dry run; `pnpm run test`/`coverage`/`check` all run from the real location, where
 * this is always true.
 *
 * Mirrors `packages/skills-catalogue/__tests__/repo-root.ts`, which solved this first.
 */
export const REPO_ROOT = join(import.meta.dirname, "..", "..", "..");
export const REPO_ROOT_REACHABLE = existsSync(join(REPO_ROOT, "pnpm-workspace.yaml"));
