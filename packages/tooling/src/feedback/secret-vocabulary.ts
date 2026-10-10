// SPDX-License-Identifier: BUSL-1.1
// Licensed under the Business Source License 1.1 (see LICENSE); Change Date: four years from publication; Change License: Apache-2.0
// Copyright (c) 2026 Empower Agile
/**
 * The names and the credential shapes the value-free gate refuses — the DATA half of the gate's
 * name and shape rules.
 *
 * INTENT: the runtime's own deny-list (`RedactionPolicy`'s multilingual pattern set, in
 * `@narrativetrace/core`) is the authority on what a sensitive field is called. This library
 * declares zero dependencies and may never link against the runtime it diagnoses, so the
 * vocabulary is restated here as data and `packages/security-tests` — the one module that may see
 * both — asserts the only implication that matters: every name the runtime redacts is also refused
 * here. Drift is a build failure, not a leak discovered in a public issue.
 *
 * @llmNote Matching here is COARSER than the runtime's on purpose. The runtime distinguishes
 * substring terms from identifier-token terms because blanking `circuitBreaker` is how a team
 * switches redaction off entirely; this gate blanks nothing — it refuses to file a report and names
 * the rule — so a near miss costs a sentence, and the only expensive mistake is the one that files
 * a credential.
 */

/**
 * Every deny-listed term, already canonical (lower case, no diacritics). Matched as a substring of
 * the canonical form of whatever key is being assigned a value.
 *
 * @llmNote Mutation testing is disabled on the LIST and not on the code that reads it. A mutant
 * that renames one term can only be killed by a test that restates the list, and a restated list is
 * exactly the drift this file exists to avoid — `packages/security-tests` already asserts the
 * implication that matters, over the shared corpus: every name the runtime redacts is refused here.
 * What a term NOT in the corpus buys is extra strictness nobody has measured, which is an honest
 * thing to say and not something a mutation score can.
 */
// Stryker disable all
const TERMS: readonly string[] = [
  // credentials
  "password",
  "passwd",
  "passphrase",
  "contrasena",
  "claveacceso",
  "clave_acceso",
  "clavesecreta",
  "clave_secreta",
  "senha",
  "motdepasse",
  "mot_de_passe",
  "passwort",
  "kennwort",
  "密码",
  "mima",
  "token",
  "apikey",
  "api_key",
  "accesskey",
  "access_key",
  "bearer",
  "secret",
  "credential",
  "privatekey",
  "private_key",
  "authorization",
  "otp",
  "mfacode",
  "mfa_code",
  "totp",
  // session
  "sessionid",
  "session_id",
  "cookie",
  "setcookie",
  "set_cookie",
  "jwt",
  // payment
  "cardnumber",
  "card_number",
  "pan",
  "tarjeta",
  "cartao",
  "cartebancaire",
  "carte_bancaire",
  "numerocarte",
  "numero_carte",
  "cvv",
  "accountnumber",
  "account_number",
  "routingnumber",
  "routing_number",
  "iban",
  // national ids
  "ssn",
  "socialsecurity",
  "social_security",
  "socialsecuritynumber",
  "taxid",
  "tax_id",
  "rut",
  "cuit",
  "dni",
  "cedula",
  "cpf",
  "cnpj",
  "nir",
  "身份证",
  "shenfenzheng",
];
// Stryker restore all

/**
 * The shapes a value gives itself away by, STRUCTURALLY — no checksum is verified here.
 *
 * @llmNote Deliberately not a copy of the runtime's checksum-exact matchers. Copying nine
 * national-id check-digit algorithms into a library that may not link the one that already has them
 * is how two implementations start disagreeing; a shape that is a SUPERSET of theirs cannot. The
 * cross-module security suite proves the superset over the shared corpus, and the price is paid in
 * the right currency: a checksum-failing lookalike is refused with a named rule instead of being
 * filed.
 */
const SHAPES: readonly RegExp[] = [
  // A JWT, anchored on the base64url encoding of a JSON object's opening — `{"`.
  /\beyJ[A-Za-z0-9_-]{6,}\.[A-Za-z0-9_-]{6,}/,
  // A PEM private key block header.
  /-----BEGIN [A-Z ]*PRIVATE KEY-----/,
  // Named credential prefixes: the five whose shape is the credential.
  /\bghp_[A-Za-z0-9]{8,}/,
  /\bgithub_pat_[A-Za-z0-9_]{8,}/,
  /\bsk-[A-Za-z0-9_-]{8,}/,
  /\bAKIA[0-9A-Z]{12,}/,
  /\bxox[abprs]-[A-Za-z0-9-]{8,}/,
  // A Chilean RUT, printed with or without its thousands dots.
  /\b\d{1,2}\.?\d{3}\.?\d{3}-[\dkK]\b/,
  // A Brazilian CPF.
  /\b\d{3}\.?\d{3}\.?\d{3}-?\d{2}\b/,
  // A Brazilian CNPJ.
  /\b\d{2}\.?\d{3}\.?\d{3}\/?\d{4}-?\d{2}\b/,
  // A Spanish DNI or NIE.
  /\b[XYZxyz]?\d{7,8}-?[A-Za-z]\b/,
  // A French NIR, bare or in the spaced form a card is printed in, Corsica included.
  /\b[12]\s?\d{2}\s?\d{2}\s?(\d{2}|\d?[AB])\s?\d{3}\s?\d{3}\s?\d{2}\b/,
  // A Chinese resident identity card.
  /\b\d{17}[\dXx]\b/,
  // A payment card number's digit length.
  /\b\d{13,19}\b/,
];

const COMBINING_MARKS = /\p{M}+/gu;

/** Whether any secret-shaped value appears anywhere in this text. */
export function containsASecretShape(text: string): boolean {
  return SHAPES.some((shape) => shape.test(text));
}

/** Whether the canonical form of this key contains any deny-listed term. */
export function namesASecret(key: string): boolean {
  const folded = canonicalKey(key);
  return TERMS.some((term) => folded.includes(term));
}

/**
 * Lower case with diacritics folded away — `contraseña`, `contrasena` and the decomposed
 * `contraseña` a Mac filesystem hands back all become one string. Separators are deliberately
 * NOT stripped, which is why `api_key` and `apikey` are two terms above rather than one.
 */
export function canonicalKey(text: string): string {
  return text.toLowerCase().normalize("NFD").replace(COMBINING_MARKS, "");
}
