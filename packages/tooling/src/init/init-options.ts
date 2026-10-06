// SPDX-License-Identifier: BUSL-1.1
// Licensed under the Business Source License 1.1 (see LICENSE); Change Date: four years from publication; Change License: Apache-2.0
// Copyright (c) 2026 Empower Agile
/**
 * What a person asked the installer to do.
 *
 * INTENT: every flag that changes a plan, in one value the planner takes as input — so a plan is
 * reproducible from a snapshot, a carrier and this, and from nothing else.
 *
 * @llmNote The defaults write nothing they were not asked to: an existing file is left alone without
 * {@link InitOptions.writeExisting}, and a skill directory somebody else owns is left alone without
 * {@link InitOptions.force}.
 */

/** Which half of the install a run covers. */
export type InitScope =
  /** The skill directories only. */
  | "skills"
  /** The managed section and the import line only. */
  | "agents-md"
  /** Both — the default. */
  | "both";

/** Whether the vendor flavour is installed beside the open-standard one. */
export type VendorChoice =
  /** Install it where the project looks like that vendor's. */
  | "auto"
  /** Install it, detected or not. */
  | "on"
  /** Never install it. */
  | "off";

const SCOPES: readonly string[] = ["skills", "agents-md", "both"];
const VENDOR_CHOICES: readonly string[] = ["auto", "on", "off"];

/** The flags one run was given. */
export interface InitOptions {
  /** Compute and show the plan, write nothing, and exit 0 even on a refusal. */
  readonly dryRun: boolean;
  /** Permission to touch a context file that exists and carries no markers. */
  readonly writeExisting: boolean;
  /** Permission to overwrite a skill directory that is not ours. */
  readonly force: boolean;
  /** Which half of the install to plan. */
  readonly scope: InitScope;
  /** Whether the vendor flavour is installed as well. */
  readonly vendorClaude: VendorChoice;
}

/**
 * Validated options, defaulting to "write both halves, touch nothing that exists, detect the vendor".
 *
 * @throws {TypeError} when a scope or vendor rule is not one of the known values — the entry point
 * parses these from a command line, so an unknown spelling must fail here rather than read as a
 * default.
 */
export function initOptions(input: Partial<InitOptions> = {}): InitOptions {
  const scope = input.scope ?? "both";
  const vendorClaude = input.vendorClaude ?? "auto";
  if (!SCOPES.includes(scope)) {
    throw new TypeError(`an install's scope is one of ${SCOPES.join(", ")}, got "${scope}"`);
  }
  if (!VENDOR_CHOICES.includes(vendorClaude)) {
    throw new TypeError(
      `an install's vendor rule is one of ${VENDOR_CHOICES.join(", ")}, got "${vendorClaude}"`,
    );
  }
  return Object.freeze({
    dryRun: input.dryRun ?? false,
    writeExisting: input.writeExisting ?? false,
    force: input.force ?? false,
    scope,
    vendorClaude,
  });
}

/** Whether skill directories are part of this scope. */
export function includesSkills(scope: InitScope): boolean {
  return scope !== "agents-md";
}

/** Whether the managed section is part of this scope. */
export function includesAgentsMd(scope: InitScope): boolean {
  return scope !== "skills";
}
