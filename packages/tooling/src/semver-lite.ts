// SPDX-License-Identifier: BUSL-1.1
// Licensed under the Business Source License 1.1 (see LICENSE); Change Date: four years from publication; Change License: Apache-2.0
// Copyright (c) 2026 Empower Agile
/**
 * Minimal semver range matcher covering exactly the range shapes this repository's own
 * `package.json` files use (`>=20`, `^1.0.0 || ^2.0.0 || ^3.0.0`, `1.x`): the doctor never needs to
 * parse an arbitrary npm range, only the ones NarrativeTrace itself declares in `engines` and
 * `peerDependencies`. A real `semver` dependency would cover forms this codebase never emits.
 */

export interface Version {
  readonly major: number;
  readonly minor: number;
  readonly patch: number;
}

/** Parses `"20.11.0"`, `"v20.11.0"`, `"20"`, or `"20.11"` — missing parts default to zero. */
export function parseVersion(raw: string): Version | undefined {
  const cleaned = raw.trim().replace(/^v/, "");
  const match = /^(\d+)(?:\.(\d+))?(?:\.(\d+))?/.exec(cleaned);
  if (!match) return undefined;
  return {
    major: Number(match[1]),
    minor: match[2] === undefined ? 0 : Number(match[2]),
    patch: match[3] === undefined ? 0 : Number(match[3]),
  };
}

/** Three-way compare, standard sign convention: negative if `left` < `right`, positive if greater. */
export function compareVersions(left: Version, right: Version): number {
  if (left.major !== right.major) return left.major - right.major;
  if (left.minor !== right.minor) return left.minor - right.minor;
  return left.patch - right.patch;
}

function satisfiesGte(version: Version, floor: Version): boolean {
  return compareVersions(version, floor) >= 0;
}

/** Standard caret semantics: `^1.2.3` := `>=1.2.3 <2.0.0`; `^0.2.3` := `>=0.2.3 <0.3.0`; `^0.0.3` := `>=0.0.3 <0.0.4`. */
function satisfiesCaret(version: Version, base: Version): boolean {
  if (compareVersions(version, base) < 0) return false;
  if (base.major > 0) return version.major === base.major;
  if (base.minor > 0) return version.major === 0 && version.minor === base.minor;
  return version.major === 0 && version.minor === 0 && version.patch === base.patch;
}

/**
 * One `||`-separated clause: `^x.y.z`, `>=x.y.z`, `x.x`/`x.y.x` (caret-equivalent), or an exact
 * version. `trimmed` must already be whitespace-trimmed — {@link satisfiesRange} does that once
 * for every clause it splits out, so the prefix checks below (`startsWith("^")`) see it without a
 * leading space.
 */
function satisfiesClause(version: Version, trimmed: string): boolean {
  if (trimmed.startsWith("^")) {
    const base = parseVersion(trimmed.slice(1));
    return base !== undefined && satisfiesCaret(version, base);
  }
  if (trimmed.startsWith(">=")) {
    const floor = parseVersion(trimmed.slice(2));
    return floor !== undefined && satisfiesGte(version, floor);
  }
  if (/\.x\b/.test(trimmed)) {
    const base = parseVersion(trimmed.replace(/\.x/g, ".0"));
    return base !== undefined && satisfiesCaret(version, base);
  }
  const exact = parseVersion(trimmed);
  return exact !== undefined && compareVersions(version, exact) === 0;
}

/**
 * Whether `versionRaw` satisfies `range` (`||`-separated clauses; a version satisfies the range if
 * it satisfies any one clause). Unparseable input on either side is a mismatch, never a throw — a
 * doctor check reports a finding, it does not crash the run.
 */
export function satisfiesRange(versionRaw: string, range: string): boolean {
  const version = parseVersion(versionRaw);
  if (!version) return false;
  // Stryker disable next-line MethodExpression: dropping .filter(Boolean) is equivalent here —
  // an empty clause (from "||" or a trailing/leading "||") only ever adds a `satisfiesClause(v,
  // "")` call to the .some() chain, and that always returns false (parseVersion("") is
  // undefined, and "" matches none of the prefix checks either), so it can never flip the
  // overall result. The filter is documentation of intent, not a behavior the type checker or a
  // mutation test can observe.
  return range
    .split("||")
    .map((clause) => clause.trim())
    .filter(Boolean)
    .some((clause) => satisfiesClause(version, clause));
}
