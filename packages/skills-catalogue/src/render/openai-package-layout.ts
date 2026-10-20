// SPDX-License-Identifier: BUSL-1.1
// Licensed under the Business Source License 1.1 (see LICENSE); Change Date: four years from publication; Change License: Apache-2.0
// Copyright (c) 2026 Empower Agile
import type { OpenAiListingFields } from "../openai-listing.js";
import type { Skill } from "../skill.js";
import { COMPOSER_ICON_PATH, LOGO_PATH } from "./openai-plugin-json.js";

/** The ZIP entry of the package's manifest, at the package root. */
export const OPENAI_PLUGIN_JSON_ENTRY = "plugin.json";

/**
 * The OpenAI plugin package's file set, sorted: `plugin.json`, one `skills/<name>/SKILL.md` per
 * catalogue skill, and the two listing assets the manifest names. `tools/openai-plugin-pack.ts`
 * asserts the built ZIP's entries EQUAL this list — derived from the catalogue, never a glob
 * (release rule 5) — so a skill added to the catalogue without a packaging change fails the gate
 * instead of shipping an incomplete ZIP.
 *
 * Throws `TypeError` for a missing `listing` and `RangeError` when two skills share a canonical
 * name, ignoring case (the ZIP would hold one page twice, or two that collide on a case-insensitive disk).
 */
export function openAiPackageEntries(
  skills: readonly Skill[],
  listing: OpenAiListingFields,
): readonly string[] {
  if (listing === undefined || listing === null) {
    throw new TypeError("openAiPackageEntries requires a listing");
  }
  const names = skills.map((skill) => skill.canonicalName);
  const folded = names.map((name) => name.toLowerCase());
  const duplicate = names.find((_, i) => folded.indexOf(folded[i] as string) !== i);
  if (duplicate !== undefined) {
    throw new RangeError(`duplicate skill canonicalName (case-insensitively): ${duplicate}`);
  }
  const pages = names.map((name) => `skills/${name}/SKILL.md`);
  return [OPENAI_PLUGIN_JSON_ENTRY, ...pages, LOGO_PATH, COMPOSER_ICON_PATH].sort();
}
