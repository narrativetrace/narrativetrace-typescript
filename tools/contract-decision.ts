// SPDX-License-Identifier: BUSL-1.1
// Licensed under the Business Source License 1.1 (see LICENSE); Change Date: four years from publication; Change License: Apache-2.0
// Copyright (c) 2026 Empower Agile
/**
 * The four claim shapes `documentation/contract.yaml` can make, and the holds/fails decision every
 * probe result goes through — the pure core of the contract gate. Deliberately does NOT parse
 * YAML, touch the filesystem, or run a probe: that is `contract-lint.ts` (schema + static checks)
 * and `contract-probe/run.ts` (real execution). Kept here, framework-free, so both the real
 * nightly run and this module's own offline fixture tests exercise the exact same decision code
 * path.
 *
 * Every entry describes the code it is committed with, so there is no applicability question to
 * ask: the probe reads `contract.yaml` AT the tag whose artifact it installed
 * (`tools/contract-check.ts`), which makes claim and artifact two halves of one commit. A claim
 * that a given version does not honour is a FAILURE, never a skip.
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
  /** The one observed value a probe must produce for the claim to hold — the YAML spells it
   * `documented_default` (reflectable-default, probed-default) or `expected_effect` (config-shape);
   * both land here as one field, `contract-lint.ts`'s parser picks whichever the entry's YAML has. */
  readonly expect: string;
  readonly probe: string;
  readonly coordinate?: string;
  readonly registry?: string;
}

export type ContractVerdict = "holds" | "fails";

export interface ContractOutcome {
  readonly entry: ContractEntry;
  readonly verdict: ContractVerdict;
  readonly message: string;
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
 * message. There is no third verdict: every entry applies at every version the probe runs against.
 */
export function decide(
  entry: ContractEntry,
  installedVersion: string,
  observed: string | undefined,
): ContractOutcome {
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
      `documentation/contract.yaml: ${entry.id} documented default "${entry.expect}" but ` +
      `${coordinate} ${installedVersion} (published) reads "${observed ?? "<no answer>"}"`,
  };
}
