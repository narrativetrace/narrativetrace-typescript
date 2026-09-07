// SPDX-License-Identifier: BUSL-1.1
// Licensed under the Business Source License 1.1 (see LICENSE); Change Date: four years from publication; Change License: Apache-2.0
// Copyright (c) 2026 Empower Agile
import { requireNonBlank } from "./guards.js";

/**
 * A deprecated alias of a canonical glossary term.
 *
 * INTENT: records "this phrasing exists in the wild; always use the canonical term instead".
 * Harvesting suppresses aliases (never re-adds them as terms) and flags their use in code as a
 * vocabulary violation.
 *
 * @remarks Human-owned data: harvesting never writes or removes a synonym.
 */
export interface SynonymAlias {
  /** The deprecated phrasing, in normalized form (lowercase, space-separated). */
  readonly alias: string;
  /** Optional human context for why the alias exists; absent — never `null` — when unexplained. */
  readonly note?: string;
}

/**
 * Builds a frozen {@link SynonymAlias}.
 *
 * @param alias the deprecated phrasing, in normalized form (lowercase, space-separated); must
 * contain a non-whitespace character.
 * @param note optional human context for why the alias exists; omitted when `undefined`.
 * @returns the frozen alias record.
 * @throws {TypeError} if `alias` is empty or only whitespace — a blank alias would match every
 * blank normalization result and silently suppress unrelated harvested terms.
 * @example
 * ```ts
 * synonymAlias("account with overdraft", "legacy v1 API phrasing");
 * ```
 */
export function synonymAlias(alias: string, note?: string): SynonymAlias {
  requireNonBlank(alias, "alias");
  return Object.freeze({ alias, ...(note !== undefined ? { note } : {}) });
}
