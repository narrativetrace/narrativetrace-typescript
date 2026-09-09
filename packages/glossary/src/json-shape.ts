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

/**
 * The deepest object/array nesting in `value`, never descending past `maxDepth + 1`.
 *
 * INTENT: the caller only ever needs to know "does this exceed the limit", never the true depth
 * of a document that already blew past it — so the moment `depthSoFar` exceeds `maxDepth` this
 * returns immediately without inspecting `value` at all. That keeps this function's own call
 * stack bounded by `maxDepth`, regardless of how deep the real input goes: measuring an
 * adversarial document can never itself become the stack overflow this guards against.
 *
 * @returns the exact depth when it is at most `maxDepth + 1`; past that, only a floor — a document
 * nesting 50,000 levels deep and one nesting 18 both come back as `maxDepth + 1`, because neither
 * is inspected any further once either is known to violate the limit.
 */
function deepestNesting(value: unknown, depthSoFar: number, maxDepth: number): number {
  if (depthSoFar > maxDepth) return depthSoFar;
  const children = Array.isArray(value)
    ? value
    : typeof value === "object" && value !== null
      ? Object.values(value)
      : undefined;
  if (children === undefined) return depthSoFar;

  const nextDepth = depthSoFar + 1;
  let deepest = nextDepth;
  for (const child of children) {
    deepest = Math.max(deepest, deepestNesting(child, nextDepth, maxDepth));
    if (deepest > maxDepth) break; // already a violation — no need to measure the remaining siblings
  }
  return deepest;
}

/**
 * Rejects a parsed JSON value nested deeper than `maxDepth` object/array levels.
 *
 * INTENT: by the time any caller sees `value`, `JSON.parse` has already fully materialized it —
 * this cannot make *parsing* safe against a pathologically deep document, because a native parser
 * either finishes or overflows its own call stack before this (or any other) code ever runs. What
 * this bounds is what comes next: a document that parsed fine but nests far deeper than any
 * legitimate use of it would, which would otherwise sail through field-by-field shape validation
 * (every narrower above checks a value's *type*, never its nesting) and be accepted whole. A port
 * whose own JSON parser recurses natively enforces the equivalent limit during parsing; here the
 * check has to live after parsing instead, on whatever `JSON.parse` already produced.
 *
 * @throws {RangeError} naming the limit and a floor on the offending depth — always exactly
 * `maxDepth + 1`, per {@link deepestNesting}, whether `value` nests one level past the limit or a
 * million — if `value` nests deeper than `maxDepth`.
 */
export function rejectExcessiveNesting(value: unknown, maxDepth: number, what: string): void {
  const depth = deepestNesting(value, 0, maxDepth);
  if (depth > maxDepth) {
    throw new RangeError(
      `${what} nests at least ${depth} levels deep, past the maximum of ${maxDepth}`,
    );
  }
}
