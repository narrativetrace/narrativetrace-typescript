// SPDX-License-Identifier: BUSL-1.1
// Licensed under the Business Source License 1.1 (see LICENSE); Change Date: four years from publication; Change License: Apache-2.0
// Copyright (c) 2026 Empower Agile
import { existsSync } from "node:fs";
import { join } from "node:path";

/**
 * Tests that reach outside this package (the fixture, `.claude/skills/`, `documentation/`) assume
 * `import.meta.dirname` sits at the package's real, checked-out location. Stryker's sandbox copies
 * only the PACKAGE directory into `.stryker-tmp/sandbox-*` (see the `vitest.coverage.shared.ts`
 * symlink's own comment for the identical problem) — from inside it, three `..` lands on the
 * package root, not the repo root, and the fixture/docs are simply not there. `REACHABLE` lets
 * those tests skip cleanly under that sandbox instead of failing Stryker's initial dry run; `pnpm
 * run test`/`coverage`/`check` all run from the real location, where this is always true.
 */
export const REPO_ROOT = join(import.meta.dirname, "..", "..", "..");
export const REPO_ROOT_REACHABLE = existsSync(join(REPO_ROOT, "pnpm-workspace.yaml"));
