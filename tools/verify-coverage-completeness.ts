// SPDX-License-Identifier: BUSL-1.1
// Licensed under the Business Source License 1.1 (see LICENSE); Change Date: four years from publication; Change License: Apache-2.0
// Copyright (c) 2026 Empower Agile
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { discoverPackages, packageSlug, type WorkspacePackage } from "./verify-all-packages.js";

/**
 * A package deliberately left off the shared coverage baseline, with the reason recorded beside
 * it — the escape hatch {@link checkCoverageCompleteness} requires instead of a silent skip.
 */
export interface Exemption {
  readonly pkg: string;
  readonly reason: string;
}

/**
 * Every `packages/*` package NOT on this list is expected to define a `coverage` script whose
 * `vitest.config.ts` imports {@link packageCoverage} (packageCoverage as re-exported from the
 * repo-root `vitest.coverage.shared.ts`) — either as-is or with a documented, dated ratchet that
 * still spreads it. A package that does neither and is not listed here is a completeness gap
 * (see {@link checkCoverageCompleteness}).
 *
 * Both entries below were seeded from the verified 2026-09 coverage-gating audit, not invented
 * here — see the fix that introduced this file for the investigation.
 */
export const COVERAGE_EXEMPTIONS: readonly Exemption[] = [
  {
    pkg: "benchmarks",
    reason:
      "perf harness, no library src/ to hold to a coverage floor — benchmarks and " +
      "security-tests are the two non-library packages, exempt for the same reason.",
  },
  {
    pkg: "security-tests",
    reason:
      "coverage stays enabled with thresholds deliberately absent — its own vitest.config.ts " +
      "carries the reason in-file (a fuzz/oracle harness with no production code to measure; " +
      "coverage reporting is kept on so src/ growing one would not go silently unreported).",
  },
];

const SHARED_IMPORT_RE = /from\s+["']\.\.\/\.\.\/vitest\.coverage\.shared["']/;
const PACKAGE_COVERAGE_USE_RE = /\bpackageCoverage\b/;

/**
 * Text-based detection of whether a `vitest.config.ts` source references the shared coverage
 * baseline: does it import from `../../vitest.coverage.shared` AND does the `packageCoverage`
 * identifier appear somewhere in the file (spread into `coverage:`, in the common case).
 *
 * LIMITS (deliberately a grep, not an AST/type check, per the fix that introduced this file):
 * this can only be fooled toward a false PASS, never a false gap — a config that imports
 * `packageCoverage` but never actually wires it into `coverage:` (dead import, or only mentioned
 * in a comment) still matches, since the check only looks for the identifier's text, not its use.
 * A renamed import (`import { packageCoverage as pc }`) still matches too, because the import
 * clause itself still contains the literal text `packageCoverage` — so this stays robust to the
 * one rename shape TypeScript actually allows here. The path match is also exact-string
 * (`../../vitest.coverage.shared`), which is fine only because every package lives at the same
 * `packages/<name>/` depth; a package one level deeper would need a different relative path and
 * would false-gap on this check even with a real import — no such package exists today.
 */
export function referencesSharedBaseline(configSource: string): boolean {
  return SHARED_IMPORT_RE.test(configSource) && PACKAGE_COVERAGE_USE_RE.test(configSource);
}

export type CoverageGapKind = "missing-script" | "missing-config" | "not-baselined";

/** One package that is neither baselined nor exempt — the finding this check exists to surface. */
export interface CoverageGap {
  readonly pkg: string;
  readonly kind: CoverageGapKind;
  readonly detail: string;
}

export interface CoverageCompletenessReport {
  readonly gaps: readonly CoverageGap[];
  readonly exempt: readonly Exemption[];
  readonly ok: readonly string[];
}

function readConfigSource(repoRoot: string, dir: string): string | undefined {
  const configPath = join(repoRoot, dir, "vitest.config.ts");
  return existsSync(configPath) ? readFileSync(configPath, "utf-8") : undefined;
}

/**
 * The completeness gap for one non-exempt package, or `undefined` when it is properly gated.
 * Checked in order: (1) omission — no `coverage` script at all; (2) a `coverage` script with no
 * `vitest.config.ts` to back it; (3) opt-out — a config present but not referencing the shared
 * baseline. Both failure shapes the fix exists to catch (omission and opt-out) are (1)/(2) and
 * (3) respectively.
 */
function gapFor(repoRoot: string, pkg: WorkspacePackage): CoverageGap | undefined {
  const slug = packageSlug(pkg.dir);
  if (!("coverage" in pkg.scripts)) {
    return {
      pkg: slug,
      kind: "missing-script",
      detail: `${pkg.dir}/package.json defines no "coverage" script`,
    };
  }
  const source = readConfigSource(repoRoot, pkg.dir);
  if (source === undefined) {
    return {
      pkg: slug,
      kind: "missing-config",
      detail: `${pkg.dir} has a "coverage" script but no vitest.config.ts`,
    };
  }
  if (!referencesSharedBaseline(source)) {
    return {
      pkg: slug,
      kind: "not-baselined",
      detail: `${pkg.dir}/vitest.config.ts does not import packageCoverage from the shared vitest.coverage.shared baseline`,
    };
  }
  return undefined;
}

/**
 * The per-commit completeness assertion the coverage gate was missing: every `packages/*`
 * package must either be gated by the shared coverage baseline or carry a written exemption —
 * never silently skipped because `turbo run coverage` only runs a package that declares the
 * script (see this fix's own report for the mechanics this closes).
 */
export function checkCoverageCompleteness(
  repoRoot: string,
  packages: readonly WorkspacePackage[] = discoverPackages(repoRoot),
  exemptions: readonly Exemption[] = COVERAGE_EXEMPTIONS,
): CoverageCompletenessReport {
  const exemptionMap = new Map(exemptions.map((e) => [e.pkg, e]));
  const gaps: CoverageGap[] = [];
  const exempt: Exemption[] = [];
  const ok: string[] = [];

  for (const pkg of packages) {
    const slug = packageSlug(pkg.dir);
    const exemption = exemptionMap.get(slug);
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
