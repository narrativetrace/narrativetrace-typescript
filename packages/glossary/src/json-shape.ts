// SPDX-License-Identifier: BUSL-1.1
// Licensed under the Business Source License 1.1 (see LICENSE); Change Date: four years from publication; Change License: Apache-2.0
// Copyright (c) 2026 Empower Agile
/**
 * Type narrowing for hand-edited JSON, one field at a time.
 *
 * INTENT: the committed glossary is curated by humans, so a typo — an unknown key, a number where
 * a string belongs, a `null` standing in for "absent" — must fail loudly at load instead of being
 * silently dropped. Every narrowing here names the offending field in its message, because the
 * reader's whole value is telling an author which line to fix. Internal helpers.
 *
 * @remarks Objects are converted to `Map`s the moment they are narrowed. Own-key iteration is then
 * the only way to reach a value, which removes prototype-chain surprises (`__proto__`,
 * `constructor`) from every downstream lookup by construction rather than by vigilance.
 */

/** A parsed JSON object as own-key entries. */
export type JsonObject = Map<string, unknown>;

/**
 * Narrows a parsed value to a JSON object.
 *
 * @throws {TypeError} naming `what` if the value is a primitive, `null`, or an array.
 */
export function asObject(value: unknown, what: string): JsonObject {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw new TypeError(`${what} must be a JSON object`);
  }
  return new Map(Object.entries(value));
}

/**
 * Narrows a parsed value to a JSON array.
 *
 * @throws {TypeError} naming `what` if the value is anything else, including a JSON object.
 */
export function asArray(value: unknown, what: string): unknown[] {
  if (!Array.isArray(value)) throw new TypeError(`${what} must be a JSON array`);
  return value;
}

/**
 * Narrows a parsed value to a string.
 *
 * @throws {TypeError} naming `what` if the value is not a string — `null` included, so a null can
 * never masquerade as an absent optional field.
 */
export function asString(value: unknown, what: string): string {
  if (typeof value !== "string") throw new TypeError(`${what} must be a JSON string`);
  return value;
}

/**
 * Narrows a parsed value to a whole number.
 *
 * @throws {TypeError} naming `what` if the value is not a number, or has a fractional part —
 * JSON has one number type, so the integer check belongs here rather than in the schema.
 */
export function asInteger(value: unknown, what: string): number {
  if (typeof value !== "number" || !Number.isInteger(value)) {
    throw new TypeError(`${what} must be a JSON integer`);
  }
  return value;
}

/**
 * Reads a required key.
 *
 * @throws {TypeError} if the key is absent or explicitly `null`; the two are the same authoring
 * mistake and must not diverge in behaviour.
 */
export function required(body: JsonObject, key: string, what: string): unknown {
  const value = body.get(key);
  if (value === undefined || value === null) {
    throw new TypeError(`missing required key '${key}' in ${what}`);
  }
  return value;
}

/**
 * Reads an optional string key.
 *
 * @returns the string, or `undefined` when the key is absent.
 * @throws {TypeError} if the key is present but not a string. An explicit `null` is a mistake, not
 * a synonym for absent: the writer omits empty fields entirely.
 */
export function optionalString(body: JsonObject, key: string): string | undefined {
  if (!body.has(key)) return undefined;
  return asString(body.get(key), key);
}

/**
 * Rejects any key outside the schema.
 *
 * INTENT: an unknown key is always an authoring mistake — a misspelling, or a field invented in a
 * newer schema. Accepting it silently would drop the author's intent on the next write, because
 * the writer emits only the fields it knows.
 *
 * @throws {TypeError} naming the first unknown key and `what` it was found in.
 */
export function rejectUnknownKeys(body: JsonObject, known: readonly string[], what: string): void {
  for (const key of body.keys()) {
    if (!known.includes(key)) throw new TypeError(`unknown key '${key}' in ${what}`);
  }
}

/**
 * Narrows a parsed value to an array of strings.
 *
 * @throws {TypeError} naming `what` if the value is not an array, or holds a non-string element.
 */
export function asStringArray(value: unknown, what: string): string[] {
  return asArray(value, what).map((element) => asString(element, `${what} element`));
}
