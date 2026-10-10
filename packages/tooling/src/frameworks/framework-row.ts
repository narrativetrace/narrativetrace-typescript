// SPDX-License-Identifier: BUSL-1.1
// Licensed under the Business Source License 1.1 (see LICENSE); Change Date: four years from publication; Change License: Apache-2.0
// Copyright (c) 2026 Empower Agile
/**
 * One row of the framework table: marker → integration module → wiring → doctor check → Tier B case.
 *
 * INTENT: a new framework is a new row, never new machinery. The doctor builds one check per row
 * from {@link CheckBinding}, the skill names no framework at all, and `llms-full.md`'s framework
 * table and `llms.txt`'s covered-frameworks line render from the same rows. Row ids and check ids
 * are a cross-port contract — append, never rename.
 */

/**
 * What in a project's manifests proves the framework is present.
 *
 * @param packages dependency names, any one of which declared in any project `package.json`
 *   (dependencies, devDependencies, peerDependencies or optionalDependencies) proves presence —
 *   matched as whole names, so `express-session` is never `express`; empty for a row whose presence
 *   is an absence (the default logger)
 * @param deferTo ids of rows that take precedence when they are detected too
 */
export interface Marker {
  readonly description: string;
  readonly packages: readonly string[];
  readonly deferTo: readonly string[];
}

/**
 * What the row's install line adds.
 *
 * @param packages the integration package first (its presence in a manifest is what "referenced"
 *   means), then every other package the wiring snippet imports or the integration declares as a
 *   peer; `@narrativetrace/*` ones are pinned to the project's NarrativeTrace version when printed,
 *   third-party ones are printed bare
 * @param dev whether the line adds them as development dependencies (a test-runner integration)
 */
export interface IntegrationModule {
  readonly packages: readonly string[];
  readonly dev: boolean;
}

/** One way the wiring shows in a source file: every pattern matches the SAME comment-free file. */
export interface Evidence {
  readonly allOf: readonly RegExp[];
}

/**
 * How the integration takes effect beyond being installed.
 *
 * `snippet`: lines the project writes into its own source. `fixture` names the compiled, tested
 * file (repository-relative) the lines come from — never typed here; the doctor reads them from
 * `wiring-snippets.json`. `evidence`: any one item found proves the wiring was applied.
 * `none`: nothing to wire, because nothing is shipped to wire.
 */
export type Wiring =
  | {
      readonly kind: "snippet";
      readonly description: string;
      readonly fixture: string;
      readonly language: string;
      readonly evidence: readonly Evidence[];
    }
  | { readonly kind: "none"; readonly description: string };

/**
 * Which doctor check observes the row — every row states one, so "unchecked" is always a decision.
 *
 * `wiring-check`: a `config.<framework>-<thing>` check of the row's own. `existing-check`: a check
 * the doctor already runs covers the row. `no-integration`: a check that REPORTS the framework has
 * no integration shipped, so an agent leaves it alone rather than guessing one.
 */
export type CheckBinding =
  | { readonly kind: "wiring-check"; readonly id: string }
  | { readonly kind: "existing-check"; readonly id: string }
  | { readonly kind: "no-integration"; readonly id: string };

/** The {@link FrameworkRow.tierBCase} of a row no Tier B case exercises yet. */
export const NO_TIER_B_CASE = "none";

export interface FrameworkRow {
  readonly id: string;
  /** The framework as a reader names it. */
  readonly name: string;
  readonly marker: Marker;
  /** `null` exactly when no integration is shipped for the framework. */
  readonly module: IntegrationModule | null;
  readonly wiring: Wiring;
  readonly check: CheckBinding;
  /** The Tier B eval case exercising the row, or {@link NO_TIER_B_CASE}. */
  readonly tierBCase: string;
}

const KEBAB = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const FRAMEWORK_CHECK_ID = /^config\.[a-z0-9]+(?:-[a-z0-9]+)+$/;

/**
 * A validated row.
 *
 * @throws {Error} naming the row when a column is empty or the columns contradict each other: a
 * wiring check without source-level wiring to look for, a no-integration row that ships a module,
 * a check id outside `config.<framework>-<thing>`.
 */
export function frameworkRow(row: FrameworkRow): FrameworkRow {
  if (!KEBAB.test(row.id)) throw new Error(`a row id is kebab-case, got "${row.id}"`);
  if (row.name.trim() === "") throw new Error(`row ${row.id} names no framework`);
  if (row.marker.description.trim() === "") throw new Error(`row ${row.id} has no marker`);
  if (row.tierBCase.trim() === "") throw new Error(`row ${row.id} names no Tier B case or none`);
  checkBindingAgrees(row);
  return row;
}

function checkBindingAgrees(row: FrameworkRow): void {
  const { check, wiring, module } = row;
  if (check.kind !== "existing-check" && !FRAMEWORK_CHECK_ID.test(check.id)) {
    throw new Error(`row ${row.id}: a framework check id is config.<framework>-<thing>`);
  }
  if (check.kind === "wiring-check" && wiring.kind !== "snippet") {
    throw new Error(`row ${row.id} earns a wiring check only for wiring visible in source`);
  }
  if ((check.kind === "no-integration") !== (module === null)) {
    throw new Error(`row ${row.id}: exactly the no-integration rows ship no module`);
  }
  if (module !== null && module.packages.length === 0) {
    throw new Error(`row ${row.id} adds no package`);
  }
  if (wiring.kind === "snippet" && wiring.evidence.some((item) => item.allOf.length === 0)) {
    throw new Error(`row ${row.id} has an evidence item with nothing to look for`);
  }
}
