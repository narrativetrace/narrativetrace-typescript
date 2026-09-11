// SPDX-License-Identifier: BUSL-1.1
// Licensed under the Business Source License 1.1 (see LICENSE); Change Date: four years from publication; Change License: Apache-2.0
// Copyright (c) 2026 Empower Agile
import { existsSync } from "node:fs";
import { join } from "node:path";
import { discoverPackages, packageSlug, type WorkspacePackage } from "./verify-all-packages.js";

/**
 * A package deliberately left off mutation testing, with the reason recorded beside it — the
 * escape hatch {@link checkMutationCompleteness} requires instead of a silent skip. Mirrors
 * `COVERAGE_EXEMPTIONS` in `verify-coverage-completeness.ts`: same shape, same default-deny
 * discipline, a different gate.
 */
export interface Exemption {
  readonly pkg: string;
  readonly reason: string;
}

/**
 * Every `packages/*` package NOT on this list is expected to be "wired for mutation testing": a
 * `mutate` script (`stryker run`) backed by its own `stryker.config.json`, the pair
 * {@link checkMutationCompleteness} checks for. That pair is the single source this repo's other
 * mutation consumers already derive from rather than keeping their own copy — `turbo.json`'s
 * `mutate` pipeline and the root `mutate`/`mutate:incremental` scripts fan out to whichever
 * package declares the script, `tools/verify-all-mutation.ts` reads the same
 * `withScript(discoverPackages(repoRoot), "mutate")` set, and the CI mutation jobs invoke
 * `pnpm run mutate`/`mutate:incremental` with no package list of their own. This file adds the
 * one piece that was missing: the exemption side, and a check that nothing falls through both.
 *
 * All three reasons below were verified by reading the named package's own `package.json` and
 * `src/` before writing them (2026-09-10) — not assumed from the analogous coverage exemption.
 * The coverage gate's exemptions went through the same audit; this is the mutation-specific
 * re-verification.
 */
export const MUTATION_EXEMPTIONS: readonly Exemption[] = [
  {
    pkg: "benchmarks",
    reason:
      "vitest bench harness only — package.json declares no test/coverage/mutate script at all, " +
      "and every src/ file is a *.bench.ts with no assertions for a mutant to falsify.",
  },
  {
    pkg: "security-tests",
    reason:
      "is itself the test oracle for every other package's hostile-corpus output (src/corpus, " +
      "src/oracle) — mutating its own assertions against itself proves nothing; same reasoning as " +
      "its coverage exemption, which keeps coverage on without thresholds for the same reason.",
  },
  {
    pkg: "standalone",
    reason:
      'src/index.ts is three "export *" re-exports and nothing else — no branches or expressions ' +
      "for Stryker to mutate; the logic it re-exports (browser, core-web, proxy) already carries " +
      "its own stryker.config.json + mutate script.",
  },
];

export type MutationGapKind = "missing-script" | "missing-config" | "double-classified";

/** One package that is neither wired for mutation testing nor exempt — or is impossibly both. */
export interface MutationGap {
  readonly pkg: string;
  readonly kind: MutationGapKind;
  readonly detail: string;
}

export interface MutationCompletenessReport {
  readonly gaps: readonly MutationGap[];
  readonly exempt: readonly Exemption[];
  readonly ok: readonly string[];
}

/**
 * Whether `pkg` carries both halves of "wired for mutation testing": the `mutate` script the
 * `turbo run mutate` pipeline and CI both invoke, and the `stryker.config.json` that script's
 * `stryker run` needs to find anything to mutate.
 */
function isWired(repoRoot: string, pkg: WorkspacePackage): boolean {
  return "mutate" in pkg.scripts && existsSync(join(repoRoot, pkg.dir, "stryker.config.json"));
}

/**
 * The completeness gap for one non-exempt package, or `undefined` when it is properly wired.
 * Checked in order: (1) omission — no `mutate` script at all; (2) a `mutate` script with no
 * `stryker.config.json` to back it.
 */
function gapFor(repoRoot: string, pkg: WorkspacePackage): MutationGap | undefined {
  const slug = packageSlug(pkg.dir);
  if (!("mutate" in pkg.scripts)) {
    return {
      pkg: slug,
      kind: "missing-script",
      detail: `${pkg.dir}/package.json defines no "mutate" script`,
    };
  }
  if (!existsSync(join(repoRoot, pkg.dir, "stryker.config.json"))) {
    return {
      pkg: slug,
      kind: "missing-config",
      detail: `${pkg.dir} has a "mutate" script but no stryker.config.json`,
    };
  }
  return undefined;
}

/**
 * The per-commit default-deny assertion mirroring `checkCoverageCompleteness`: every
 * `packages/*` package must land in EXACTLY ONE of "wired for mutation testing" (a `mutate`
 * script + `stryker.config.json`) or `exemptions` (a written reason) — never neither, never both.
 * `turbo run mutate` silently skips a package with no `mutate` script; this is the check that
 * turns that silence into a named failure. It also catches the opposite mistake a plain presence
 * check would miss: an exemption nobody removed after the package it excuses got wired up for
 * real — `double-classified`, reported as a gap exactly like the missing case, because a stale
 * exemption reason is itself a bookkeeping defect, not a harmless leftover.
 *
 * Cheap by construction: file and `package.json`-script presence only, never a `stryker run`.
 */
export function checkMutationCompleteness(
  repoRoot: string,
  packages: readonly WorkspacePackage[] = discoverPackages(repoRoot),
  exemptions: readonly Exemption[] = MUTATION_EXEMPTIONS,
): MutationCompletenessReport {
  const exemptionMap = new Map(exemptions.map((e) => [e.pkg, e]));
  const gaps: MutationGap[] = [];
  const exempt: Exemption[] = [];
  const ok: string[] = [];

  for (const pkg of packages) {
    const slug = packageSlug(pkg.dir);
    const exemption = exemptionMap.get(slug);
    const wired = isWired(repoRoot, pkg);

    if (exemption && wired) {
      gaps.push({
        pkg: slug,
        kind: "double-classified",
        detail:
          `${pkg.dir} is both wired for mutation testing (mutate script + stryker.config.json) ` +
          `and listed in MUTATION_EXEMPTIONS ("${exemption.reason}") — remove one`,
      });
      continue;
    }
    if (exemption) {
      exempt.push(exemption);
      continue;
    }
    const gap = gapFor(repoRoot, pkg);
    if (gap) gaps.push(gap);
    else ok.push(slug);
  }

  return { gaps, exempt, ok };
}
