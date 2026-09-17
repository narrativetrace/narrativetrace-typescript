// SPDX-License-Identifier: BUSL-1.1
// Licensed under the Business Source License 1.1 (see LICENSE); Change Date: four years from publication; Change License: Apache-2.0
// Copyright (c) 2026 Empower Agile
/**
 * The four claim shapes `documentation/contract.yaml` can make, and the holds/fails/
 * not-applicable-before-since decision every probe result goes through — the pure core of the
 * docs-vs-published contract (docs-vs-published-gate-2026-09-12.md §2). Deliberately does NOT
 * parse YAML, touch the filesystem, or run a probe: that is `contract-lint.ts` (schema + static
 * checks) and `contract-probe/run.ts` (real execution). Kept here, framework-free, so both the
 * real nightly run and this module's own offline fixture tests exercise the exact same decision
 * code path (docs-vs-published-gate-2026-09-12.md §3's four historical instances).
 */

export const CONTRACT_KINDS = [
  "entry-point",
  "reflectable-default",
  "probed-default",
  "config-shape",
] as const;

export type ContractKind = (typeof CONTRACT_KINDS)[number];

export function isContractKind(value: string): value is ContractKind {
  return (CONTRACT_KINDS as readonly string[]).includes(value);
}

export interface ContractEntry {
  readonly id: string;
  readonly kind: ContractKind;
  readonly page: string;
  readonly claim: string;
  readonly since: string;
  /** The one observed value a probe must produce for the claim to hold — the YAML spells it
   * `documented_default` (reflectable-default, probed-default) or `expected_effect` (config-shape);
   * both land here as one field, `contract-lint.ts`'s parser picks whichever the entry's YAML has. */
  readonly expect: string;
  readonly probe: string;
  readonly coordinate?: string;
  readonly registry?: string;
}

export type ContractVerdict = "holds" | "fails" | "not-applicable-before-since";

export interface ContractOutcome {
  readonly entry: ContractEntry;
  readonly verdict: ContractVerdict;
  readonly message: string;
}

/** `x.y.z` -> `[x, y, z]` for a plain numeric compare — every `since` is validated against
 * contract-lint's version pattern before this is ever called. */
function versionParts(version: string): readonly number[] {
  return version.split(".").map(Number);
}

/**
 * True while `since` is NOT strictly later than `installedVersion` — the only case
 * docs-vs-published-gate-2026-09-12.md §5.1 ruling 1 exempts a claim from being checked at all.
 */
export function isApplicable(since: string, installedVersion: string): boolean {
  const a = versionParts(since);
  const b = versionParts(installedVersion);
  for (let i = 0; i < Math.max(a.length, b.length); i++) {
    const x = a[i] ?? 0;
    const y = b[i] ?? 0;
    if (x !== y) return x < y;
  }
  return true; // equal versions: since holds AT the installed version, so it is applicable
}

/**
 * The sentinel a probe prints, in place of an observed value, when it could not run at all — an
 * unresolvable import, a fixture that never executed, a CLI that answered "could not run". It is
 * still a FAILURE (release-retrospective-2026-09-07 rule 2: a check that finds nothing to check is
 * red, never a false verdict), but it is a failure of the harness, and {@link decide} must not
 * dress it up as a finding about the published package.
 */
export const COULD_NOT_PROBE = "could-not-probe";

/** A probe that could not run reports its reason, never a verdict about the package. */
function couldNotProbeMessage(entry: ContractEntry, observed: string): string {
  return (
    `documentation/contract.yaml: ${entry.id} COULD NOT BE PROBED — the harness never ` +
    `observed the published package, so this is not a verdict about it: ${observed}`
  );
}

/**
 * `observed` is `undefined` when the probe produced no answer at all, and starts with
 * {@link COULD_NOT_PROBE} when it produced an explained non-answer; both fail, with their own
 * message. Only a `since` later than `installedVersion` is ever skipped.
 */
export function decide(
  entry: ContractEntry,
  installedVersion: string,
  observed: string | undefined,
): ContractOutcome {
  if (!isApplicable(entry.since, installedVersion)) {
    return {
      entry,
      verdict: "not-applicable-before-since",
      message: `"${entry.id}": since ${entry.since} is later than installed ${installedVersion} — skipped`,
    };
  }
  if (observed === entry.expect) {
    return { entry, verdict: "holds", message: `"${entry.id}": holds` };
  }
  if (observed?.startsWith(COULD_NOT_PROBE)) {
    return { entry, verdict: "fails", message: couldNotProbeMessage(entry, observed) };
  }
  const coordinate = entry.coordinate ?? entry.id;
  return {
    entry,
    verdict: "fails",
    message:
      `documentation/contract.yaml: ${entry.id} documented default "${entry.expect}" ` +
      `(since ${entry.since}) but ${coordinate} ${installedVersion} (published) reads ` +
      `"${observed ?? "<no answer>"}"`,
  };
}
