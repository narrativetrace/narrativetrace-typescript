// SPDX-License-Identifier: BUSL-1.1
// Licensed under the Business Source License 1.1 (see LICENSE); Change Date: four years from publication; Change License: Apache-2.0
// Copyright (c) 2026 Empower Agile
/**
 * Structural (not name-based) secret detection for {@link RedactionPolicy.shouldRedactValue} —
 * a second, independent redaction axis: what a string *is*, not what its field is named.
 * Deliberately narrow — no entropy/"looks random" heuristics — because a value blanked by
 * guesswork is a hole in the narrative the reader cannot see and cannot switch off per-value. Port
 * of the cross-runtime shape from Java's `SecretValueShapes` (2026-09-02 audit finding F3).
 *
 * @remarks The fourth axis, national identity numbers (Chilean RUT, Brazilian CPF/CNPJ, Spanish
 * DNI/NIE, French NIR, Chinese resident id, and the US SSN's structural-rule exception), lives in
 * its own sibling module, {@link isNationalIdShaped}, because it is several checksums rather than
 * one matcher — see that module's doc comment.
 */

import { isNationalIdShaped } from "./national-id-shapes.js";

const JWT_PATTERN = /^eyJ[\w-]+\.[\w-]+\.[\w-]+$/;

/** Three base64url segments, the first decoding a JSON-object header — `eyJ` is base64url of `{"`. */
function isJwtShaped(value: string): boolean {
  return JWT_PATTERN.test(value);
}

const PAN_SEPARATORS = /[ -]/g;
const PAN_DIGITS = /^\d{13,19}$/;

/** 13–19 digits (optionally space/dash separated) passing the Luhn checksum — a structural check,
 * not a length guess, so an order number that fails Luhn stays visible. */
function isPanShaped(value: string): boolean {
  const digits = value.replace(PAN_SEPARATORS, "");
  return PAN_DIGITS.test(digits) && isLuhnValid(digits);
}

function isLuhnValid(digits: string): boolean {
  let sum = 0;
  let doubleNext = false;
  for (let i = digits.length - 1; i >= 0; i--) {
    let digit = digits.charCodeAt(i) - 48;
    if (doubleNext) {
      digit *= 2;
      if (digit > 9) digit -= 9;
    }
    sum += digit;
    doubleNext = !doubleNext;
  }
  return sum % 10 === 0;
}

const COOKIE_PAIR = /^[^=;]+=[^;]*;/;
const COOKIE_ATTRIBUTE = /;\s*(path|domain|secure|httponly|samesite|max-age|expires)\b/i;

/** A `name=value;` pair plus a named RFC 6265 attribute — `key=value` and `name=Ada; age=36` (no
 * attribute keyword) stay visible; a real `Set-Cookie` header value always carries one. */
function isSetCookieShaped(value: string): boolean {
  return COOKIE_PAIR.test(value) && COOKIE_ATTRIBUTE.test(value);
}

/** Whether `value` structurally matches one of the checked secret shapes: a JWT, a Luhn-valid PAN,
 * a `Set-Cookie` string, or a national identity number (see {@link isNationalIdShaped}). */
export function isSecretShaped(value: string): boolean {
  return (
    isJwtShaped(value) ||
    isPanShaped(value) ||
    isNationalIdShaped(value) ||
    isSetCookieShaped(value)
  );
}

// biome-ignore lint/suspicious/noControlCharactersInRegex: the ASCII range test is the point.
const NON_ASCII = /[^\x00-\x7f]/;
const COMBINING_MARKS = /\p{M}+/gu;

/**
 * Folds a field name or a deny-list pattern to the one spelling both are compared in: lower case,
 * and without diacritics.
 *
 * INTENT: the deny-list carries every language's vocabulary, and a Spanish team writes
 * `contraseña` while the same team's DTO generator writes `contrasena`. Both are the word
 * "password" and both must be hidden, so the fold happens on *both* sides rather than the pattern
 * set listing every spelling. Mirrors Java's `SecretValueShapes.canonical`.
 *
 * @llmNote The ASCII test in front is not premature: this runs once per introspected member on
 * the rendering path, and virtually every real field name is ASCII, where `toLowerCase` alone
 * already answers. NFD + mark-stripping is only paid for by names that carry a non-ASCII
 * character.
 *
 * @remarks Total on any input — `normalize("NFD")` passes unpaired surrogates, noncharacters and
 * bidi controls through rather than rejecting them, so a hostile field name folds to something
 * harmless instead of throwing out of a redaction decision — the one place an exception would
 * fail open.
 */
export function canonical(text: string): string {
  const lower = text.toLowerCase();
  return NON_ASCII.test(lower) ? lower.normalize("NFD").replace(COMBINING_MARKS, "") : lower;
}
