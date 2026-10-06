// SPDX-License-Identifier: BUSL-1.1
// Licensed under the Business Source License 1.1 (see LICENSE); Change Date: four years from publication; Change License: Apache-2.0
// Copyright (c) 2026 Empower Agile
import {
  type SkillCatalogue,
  type SkillEntry,
  skillCatalogue,
  skillEntry,
} from "./skill-catalogue.js";

/**
 * Reads a carrier's `catalogue.json` into a {@link SkillCatalogue}.
 *
 * INTENT: one place knows the catalogue's shape. Every field is mandatory and every type is checked
 * here, so a malformed carrier is refused at open time with a message naming the entry — never
 * half-installed.
 *
 * @llmNote The subset is deliberate: a catalogue holds only strings, so a number, a boolean or a
 * `null` in one is a malformed catalogue and says so, instead of being coerced. `JSON.parse` accepts
 * all of them; these checks are what make the document's contract narrower than JSON's.
 *
 * @llmNote The catalogue carries no version by design; do not add one here. The stamp is the
 * carrier package's own version, which the carrier derives separately.
 */

type JsonObject = Record<string, unknown>;

function asObject(value: unknown, what: string): JsonObject {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw new TypeError(`catalogue: ${what} must be a JSON object`);
  }
  return value as JsonObject;
}

function stringField(owner: JsonObject, key: string, what: string): string {
  const value = owner[key];
  if (typeof value !== "string") {
    throw new TypeError(`catalogue: ${what} has no "${key}" string field`);
  }
  return value;
}

function array(root: JsonObject, key: string): readonly unknown[] {
  const value = root[key];
  if (!Array.isArray(value)) throw new TypeError(`catalogue: "${key}" must be a JSON array`);
  return value;
}

function entryOf(skill: JsonObject): SkillEntry {
  const name = stringField(skill, "name", "skill");
  return skillEntry(
    name,
    stringField(skill, "description", name),
    stringField(skill, "agents", name),
    stringField(skill, "claude", name),
  );
}

function parse(json: string): unknown {
  try {
    return JSON.parse(json);
  } catch (cause) {
    throw new TypeError(`catalogue: not readable as JSON — ${(cause as Error).message}`);
  }
}

/**
 * @param json the whole `catalogue.json` text
 * @throws {TypeError} when the document is malformed, a field is missing or wrongly typed, or a
 * skill name repeats.
 */
export function readSkillCatalogue(json: string): SkillCatalogue {
  const root = asObject(parse(json), "catalogue");
  const runtime = stringField(root, "runtime", "catalogue");
  return skillCatalogue(
    runtime,
    array(root, "skills").map((element) => entryOf(asObject(element, "skill"))),
  );
}
