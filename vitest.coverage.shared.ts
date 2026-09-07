// SPDX-License-Identifier: BUSL-1.1
// Licensed under the Business Source License 1.1 (see LICENSE); Change Date: four years from publication; Change License: Apache-2.0
// Copyright (c) 2026 Empower Agile
/**
 * Shared per-package coverage gate. Every workspace package's
 * `vitest.config.ts` imports this so the floors live in exactly one place
 * (mirroring the Java build, where the 98 % floor is a single convention
 * applied to every module).
 *
 * The baseline floor is 98/98/98/98. A package measured below the baseline
 * carries a ratchet: its config spreads {@link packageCoverage} and overrides
 * `thresholds` with its actual measured value rounded down, so the gate is
 * green today and only allowed to move up.
 *
 * Every package also carries a symlink `vitest.coverage.shared.ts -> ../../`
 * pointing back at this file. Stryker copies each package into a
 * `.stryker-tmp/sandbox-*` two levels below the package root and bundles the
 * sandboxed `vitest.config.ts` with esbuild, so its `../../` import lands on
 * the package root instead of the repo root; the symlink makes that path
 * resolve to this same file. Deleting a package's symlink breaks only that
 * package's `mutate` task — everything else resolves the repo-root file
 * directly.
 */
export const packageCoverage = {
  provider: "v8",
  include: ["src/**"],
  thresholds: {
    lines: 98,
    functions: 98,
    branches: 98,
    statements: 98,
  },
} as const;

/**
 * Shared `test.exclude` for a package's own (non-sandboxed) run.
 *
 * INTENT: a `mutate` run that is interrupted — or simply not cleaned up —
 * leaves `.stryker-tmp/sandbox-*` copies of the whole package on disk. Vitest's
 * default `exclude` does not list them, so the next plain `vitest run` collects
 * every stale copy's suite a second time and reports failures from source that
 * is no longer in `src/`. The directory is gitignored, so nothing warns.
 *
 * Setting `exclude` replaces Vitest's defaults, so the `node_modules` pattern
 * is repeated here deliberately. Stryker runs Vitest with the sandbox as the
 * working directory, so the `.stryker-tmp` pattern never hides the sandbox's
 * own tests from the mutation run that owns it.
 */
export const packageTestExclude: string[] = ["**/node_modules/**", "**/.stryker-tmp/**"];
