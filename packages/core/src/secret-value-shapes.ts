// SPDX-License-Identifier: BUSL-1.1
// Licensed under the Business Source License 1.1 (see LICENSE); Change Date: four years from publication; Change License: Apache-2.0
// Copyright (c) 2026 Empower Agile
/**
 * Structural (not name-based) secret detection for {@link RedactionPolicy.shouldRedactValue} —
 * a second, independent redaction axis: what a string *is*, not what its field is named. Deliberately
 * narrow — three checked shapes, no entropy/"looks random" heuristics — because a value blanked by
 * guesswork is a hole in the narrative the reader cannot see and cannot switch off per-value. Port of
 * the cross-port shape from Java's `SecretValueShapes` (2026-09-02 audit finding F3).
 */

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

/** Whether `value` structurally matches one of the checked secret shapes (JWT, PAN, `Set-Cookie`). */
export function isSecretShaped(value: string): boolean {
  return isJwtShaped(value) || isPanShaped(value) || isSetCookieShaped(value);
}
