// SPDX-License-Identifier: BUSL-1.1
// Licensed under the Business Source License 1.1 (see LICENSE); Change Date: four years from publication; Change License: Apache-2.0
// Copyright (c) 2026 Empower Agile
/**
 * Recognises national identity numbers by their own check digits, whatever the field is called —
 * the fourth {@link isSecretShaped | secret-value-shapes} axis, kept in its own module because it
 * is six checksums (plus one structural-rule exception) rather than one matcher. Port of Java's
 * `NationalIdShapes`, landed the same day across Java/Swift/.NET/Python (2026-09-10).
 *
 * INTENT: `secret-value-shapes.ts` already answers "are these bytes a credential?" for a JWT, a
 * card number and a `Set-Cookie` string. A national identity number is the same question in a
 * different jurisdiction, and it is the one piece of sensitive data whose *name* is most often in
 * a language the always-on deny-list is read in but not written in — `numero`, `documento`, `id`.
 * The value's own checksum does not care what language the field name is in, which is why these
 * shapes are language-neutral and on by default for everyone.
 *
 * @llmNote Every matcher here is a checksum, never a length-and-digits guess, and every one is
 * gated by a cheap regex before any arithmetic runs — the same discipline the Luhn PAN matcher
 * uses. A scheme without a check digit (the pre-1999 15-digit Chinese id, a bare Spanish DNI with
 * the letter dropped) is deliberately absent: it would be indistinguishable from an order number,
 * and a security default that blanks ordinary business fields is one teams switch off entirely.
 * The one exception is the US Social Security Number, which has no check digit at all — see
 * {@link isUsSsnShaped}'s own doc comment for what stands in for one.
 *
 * @remarks The Chilean RUT requires its verifier separator. Chile writes a RUT as `12.345.678-5`
 * or `12345678-5`, and the dash is what distinguishes it from any other eight-digit number;
 * accepting a bare nine-digit run would redact roughly one in eleven of every order and invoice
 * number in the world, which is the false-positive budget this module exists to avoid. Dots are
 * optional, the dash is not.
 *
 * @remarks CPF and CNPJ reject repeated-digit strings (`00000000000`, `11111111111`) before the
 * checksum, because every one of them satisfies both check digits and none of them is a real
 * document — they are the placeholder a form writes when it has none.
 */

/** Strips the punctuation every formatted scheme below is written with — dots, dashes, slashes —
 * leaving the bare digits (and, for Spanish ids, the check letter) a checksum runs over. */
function withoutPunctuation(value: string): string {
  return value.replace(/[.\-/]/g, "");
}

/** A digit's numeric value by ASCII code point — never `str[i]` under `noUncheckedIndexedAccess`,
 * matching this file's sibling `isLuhnValid`. Every caller already gated its input through a
 * regex requiring `0`-`9` at this position, so this is total in practice. */
function digitAt(digits: string, index: number): number {
  return digits.charCodeAt(index) - 48;
}

function isRepeatedDigit(digits: string): boolean {
  const first = digits.charAt(0);
  for (let i = 1; i < digits.length; i++) {
    if (digits.charAt(i) !== first) return false;
  }
  return true;
}

/** Both Brazilian schemes (CPF, CNPJ) share the final step: a remainder below two means a zero
 * check digit. */
function checkDigitFromRemainder(sum: number): number {
  const remainder = sum % 11;
  return remainder < 2 ? 0 : 11 - remainder;
}

const RUT_PATTERN = /^(?:\d{1,2}\.\d{3}\.\d{3}|\d{7,8})-[0-9kK]$/;

/** Chile: 7-8 digits, optional thousands dots, and a mod-11 verifier that may be `K`. */
function isRutShaped(value: string): boolean {
  if (!RUT_PATTERN.test(value)) return false;
  const compact = withoutPunctuation(value);
  const body = compact.slice(0, -1);
  return compact.slice(-1).toLowerCase() === rutVerifier(body);
}

/** Chile's mod 11: weights 2..7 cycling from the right, `10` written `K`. */
function rutVerifier(body: string): string {
  let sum = 0;
  let weight = 2;
  for (let i = body.length - 1; i >= 0; i--) {
    sum += digitAt(body, i) * weight;
    weight = weight === 7 ? 2 : weight + 1;
  }
  const rest = 11 - (sum % 11);
  if (rest === 11) return "0";
  return rest === 10 ? "k" : String(rest);
}

const CPF_PATTERN = /^(?:\d{3}\.\d{3}\.\d{3}-\d{2}|\d{11})$/;

/** Brazil: 11 digits, bare or `NNN.NNN.NNN-NN`, two mod-11 check digits. */
function isCpfShaped(value: string): boolean {
  if (!CPF_PATTERN.test(value)) return false;
  const digits = withoutPunctuation(value);
  if (isRepeatedDigit(digits)) return false;
  return (
    cpfCheckDigit(digits, 9) === digitAt(digits, 9) &&
    cpfCheckDigit(digits, 10) === digitAt(digits, 10)
  );
}

/** Brazil's mod 11 for the CPF: weights count down from `length + 1` to 2. */
function cpfCheckDigit(digits: string, length: number): number {
  let sum = 0;
  for (let i = 0; i < length; i++) {
    sum += digitAt(digits, i) * (length + 1 - i);
  }
  return checkDigitFromRemainder(sum);
}

const CNPJ_PATTERN = /^(?:\d{2}\.\d{3}\.\d{3}\/\d{4}-\d{2}|\d{14})$/;

/** Brazil: 14 digits, bare or `NN.NNN.NNN/NNNN-NN`, two mod-11 check digits. */
function isCnpjShaped(value: string): boolean {
  if (!CNPJ_PATTERN.test(value)) return false;
  const digits = withoutPunctuation(value);
  if (isRepeatedDigit(digits)) return false;
  return (
    cnpjCheckDigit(digits, 12) === digitAt(digits, 12) &&
    cnpjCheckDigit(digits, 13) === digitAt(digits, 13)
  );
}

/** Brazil's mod 11 for the CNPJ: weights 2..9 cycling from the right. */
function cnpjCheckDigit(digits: string, length: number): number {
  let sum = 0;
  let weight = 2;
  for (let i = length - 1; i >= 0; i--) {
    sum += digitAt(digits, i) * weight;
    weight = weight === 9 ? 2 : weight + 1;
  }
  return checkDigitFromRemainder(sum);
}

const SPANISH_ID_PATTERN = /^(?:[XYZ]\d{7}|\d{8})-?[A-Z]$/i;

/** The Spanish check letter, indexed by the document number modulo 23. */
const DNI_LETTERS = "TRWAGMYFPDXBNJZSQVHLCKE";

/** A NIE's leading letter stands for a digit: `X`=0, `Y`=1, `Z`=2. */
const NIE_PREFIXES = "XYZ";

/** Spain: a DNI is 8 digits plus a mod-23 check letter; a NIE swaps the leading digit for
 * `X`/`Y`/`Z`. */
function isSpanishIdShaped(value: string): boolean {
  if (!SPANISH_ID_PATTERN.test(value)) return false;
  const upper = withoutPunctuation(value.toUpperCase());
  const body = upper.slice(0, -1);
  const prefix = NIE_PREFIXES.indexOf(body.charAt(0));
  const number = prefix < 0 ? body : String(prefix) + body.slice(1);
  return DNI_LETTERS.charAt(Number(number) % 23) === upper.slice(-1);
}

const NIR_PATTERN = /^[1-478]\d{4}(?:\d{2}|2[AB])\d{8}$/i;

/** France: 13-character body plus a 2-digit mod-97 key. Only the department (positions 6-7) may
 * be non-numeric, and only as Corsica's `2A`/`2B`. */
function isFrenchNirShaped(value: string): boolean {
  const compact = value.replace(/ /g, "");
  if (!NIR_PATTERN.test(compact)) return false;
  const body = compact.slice(0, 13).toUpperCase().replace("2A", "19").replace("2B", "18");
  const key = Number(compact.slice(13));
  return key === 97 - (Number(body) % 97);
}

const CHINESE_ID_PATTERN = /^\d{17}[0-9Xx]$/;
const CHINESE_WEIGHTS = [7, 9, 10, 5, 8, 4, 2, 1, 6, 3, 7, 9, 10, 5, 8, 4, 2] as const;

/** The Chinese check character, indexed by the weighted sum modulo 11. */
const CHINESE_CHECK_CHARACTERS = "10X98765432";

const EARLIEST_BIRTH_YEAR = 1900;
const LATEST_BIRTH_YEAR = 2100;

/** China: the post-1999 resident identity card — 17 digits, a plausible embedded birth date, and
 * a weighted mod-11 check character. */
function isChineseResidentIdShaped(value: string): boolean {
  if (!CHINESE_ID_PATTERN.test(value) || !hasPlausibleBirthDate(value)) return false;
  let sum = 0;
  for (let i = 0; i < CHINESE_WEIGHTS.length; i++) {
    sum += digitAt(value, i) * CHINESE_WEIGHTS[i];
  }
  return CHINESE_CHECK_CHARACTERS.charAt(sum % 11) === value.slice(17).toUpperCase();
}

/** Positions 6-13 (0-indexed) of a Chinese resident id are the holder's birth date. Checking it
 * removes most of what the check character alone would let through — a one-in-eleven hit rate on
 * eighteen-digit numbers is otherwise the whole false-positive budget. */
function hasPlausibleBirthDate(value: string): boolean {
  const year = Number(value.slice(6, 10));
  const month = Number(value.slice(10, 12));
  const day = Number(value.slice(12, 14));
  return (
    year >= EARLIEST_BIRTH_YEAR &&
    year <= LATEST_BIRTH_YEAR &&
    month >= 1 &&
    month <= 12 &&
    day >= 1 &&
    day <= 31
  );
}

const US_SSN_PATTERN = /^(\d{3})-(\d{2})-(\d{4})$/;

/**
 * A US Social Security number, written only in the dashed `AAA-GG-SSSS` form.
 *
 * @remarks The one matcher in this module that is not a checksum, because the scheme has none.
 * Nine bare digits are arithmetically indistinguishable from an order number, an account id, or
 * an unpunctuated phone number — matching those would blank ordinary business data in every
 * trace. The dashes are the only evidence the writer meant an SSN (the same reasoning the Chilean
 * RUT's required dash rests on, above). In their place, the SSA's own structural rules stand in
 * for the missing checksum: area (first 3) `000`, `666` or `900`-`999`; group (middle 2) `00`;
 * serial (last 4) `0000` are never issued. Rejecting those costs nothing real and keeps
 * `000-00-0000` — the placeholder that fills test fixtures and redacted forms everywhere —
 * visible rather than blanked.
 */
function isUsSsnShaped(value: string): boolean {
  const match = US_SSN_PATTERN.exec(value);
  if (!match) return false;
  const [area, group, serial] = [match[1] as string, match[2] as string, match[3] as string];
  if (area === "000" || area === "666" || area.startsWith("9")) return false;
  return group !== "00" && serial !== "0000";
}

/**
 * Whether `value` is a national identity number that passes its own checksum — or, for the US
 * Social Security Number, the structural rule that stands in for one.
 *
 * @returns `true` for a valid Chilean RUT, Brazilian CPF or CNPJ, Spanish DNI or NIE, French NIR,
 * Chinese resident identity card, or a dashed US Social Security number.
 */
export function isNationalIdShaped(value: string): boolean {
  return (
    isRutShaped(value) ||
    isCpfShaped(value) ||
    isCnpjShaped(value) ||
    isSpanishIdShaped(value) ||
    isFrenchNirShaped(value) ||
    isChineseResidentIdShaped(value) ||
    isUsSsnShaped(value)
  );
}
