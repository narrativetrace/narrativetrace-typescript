// SPDX-License-Identifier: BUSL-1.1
// Licensed under the Business Source License 1.1 (see LICENSE); Change Date: four years from publication; Change License: Apache-2.0
// Copyright (c) 2026 Empower Agile
import { describe, expect, test } from "vitest";
import { RedactionPolicy } from "../src/redaction-policy.js";

describe("RedactionPolicy", () => {
  test("MARKER is the canonical [REDACTED] token", () => {
    expect(RedactionPolicy.MARKER).toBe("[REDACTED]");
  });

  test("DEFAULT redacts exact deny-list names", () => {
    const p = RedactionPolicy.DEFAULT;
    for (const name of [
      "password",
      "passwd",
      "secret",
      "token",
      "apikey",
      "api_key",
      "cvv",
      "ssn",
      "authorization",
      "credential",
      "privatekey",
      "private_key",
    ]) {
      expect(p.shouldRedact(name)).toBe(true);
    }
  });

  test("DEFAULT matches case-insensitively as a substring", () => {
    const p = RedactionPolicy.DEFAULT;
    expect(p.shouldRedact("userPassword")).toBe(true);
    expect(p.shouldRedact("apiToken")).toBe(true);
    expect(p.shouldRedact("CardCVV")).toBe(true);
  });

  test("DEFAULT does not redact benign names", () => {
    const p = RedactionPolicy.DEFAULT;
    expect(p.shouldRedact("username")).toBe(false);
    expect(p.shouldRedact("email")).toBe(false);
    expect(p.shouldRedact("id")).toBe(false);
  });

  test("DISABLED redacts nothing by name", () => {
    expect(RedactionPolicy.DISABLED.shouldRedact("password")).toBe(false);
  });

  test("ofPatterns replaces the deny-list entirely", () => {
    const p = RedactionPolicy.ofPatterns(["classified"]);
    expect(p.shouldRedact("topClassifiedField")).toBe(true);
    expect(p.shouldRedact("password")).toBe(false);
  });
});

// Cross-runtime shape F2, 2026-09-02 audit: the Java report's own name-list gap, mirrored here —
// cardnumber/jwt/cookie/session/account-number/routing-number were absent from DEFAULT_PATTERNS.
describe("RedactionPolicy.DEFAULT — the widened name list", () => {
  test("redacts every reported name", () => {
    const p = RedactionPolicy.DEFAULT;
    for (const name of [
      "cardnumber",
      "card_number",
      "jwt",
      "cookie",
      "setcookie",
      "set_cookie",
      "sessionid",
      "session_id",
      "accountnumber",
      "account_number",
      "routingnumber",
      "routing_number",
    ]) {
      expect(p.shouldRedact(name)).toBe(true);
    }
  });

  test("matches case-insensitively and inside compound names", () => {
    const p = RedactionPolicy.DEFAULT;
    expect(p.shouldRedact("CardNumber")).toBe(true);
    expect(p.shouldRedact("customerAccountNumber")).toBe(true);
    expect(p.shouldRedact("SetCookieHeader")).toBe(true);
  });
});

// `pan`/`iban` are NOT safe as plain substrings under this policy's contains-based matching —
// "company".includes("pan") is true. They are matched on identifier-token boundaries instead, plus
// a whole-name comparison for an oddly-cased exact name a tokenizer alone would split apart.
describe("RedactionPolicy.DEFAULT — pan/iban match tokens, never bare substrings", () => {
  test("redacts pan/iban as a whole token, in any casing/compound position", () => {
    const p = RedactionPolicy.DEFAULT;
    expect(p.shouldRedact("pan")).toBe(true);
    expect(p.shouldRedact("PAN")).toBe(true);
    expect(p.shouldRedact("cardPan")).toBe(true);
    expect(p.shouldRedact("panNumber")).toBe(true);
    expect(p.shouldRedact("iban")).toBe(true);
    expect(p.shouldRedact("IBAN")).toBe(true);
    expect(p.shouldRedact("ibanNumber")).toBe(true);
  });

  test("an oddly-cased exact name matches by whole-name comparison even when tokenizing splits it", () => {
    // Tokenizing "IbAn" on a lower→upper camelCase boundary gives ["Ib", "An"] — neither is "iban".
    expect(RedactionPolicy.DEFAULT.shouldRedact("IbAn")).toBe(true);
  });

  test("does not redact ordinary business fields that merely contain the letters", () => {
    const p = RedactionPolicy.DEFAULT;
    for (const name of [
      "companyName",
      "expansionRatio",
      "panelId",
      "spanCount",
      "planId",
      "japaneseAddress",
    ]) {
      expect(p.shouldRedact(name)).toBe(false);
    }
  });

  test("a custom pattern list gets the same token-boundary protection for pan/iban", () => {
    const p = RedactionPolicy.ofPatterns(["pan", "iban"]);
    expect(p.shouldRedact("panelId")).toBe(false);
    expect(p.shouldRedact("cardPan")).toBe(true);
  });
});

// The default vocabulary is multilingual and always on (family standard, mirroring the Java
// runtime): Spanish, Portuguese, French and Chinese words beside the English ones, no locale to
// select. Names and patterns both fold through canonical (lowercase + accent-strip), so the
// accented and unaccented spellings of a word are one pattern rather than two.
describe("RedactionPolicy.DEFAULT — the multilingual vocabulary", () => {
  const p = RedactionPolicy.DEFAULT;

  test("redacts Spanish sensitive names", () => {
    for (const name of ["contraseña", "tarjeta", "cédula", "rut", "cuit", "dni"]) {
      expect(p.shouldRedact(name)).toBe(true);
    }
  });

  test("redacts Portuguese sensitive names", () => {
    for (const name of ["senha", "cpf", "cnpj", "cartão"]) {
      expect(p.shouldRedact(name)).toBe(true);
    }
  });

  test("redacts French sensitive names", () => {
    for (const name of ["motDePasse", "mot_de_passe", "nir"]) {
      expect(p.shouldRedact(name)).toBe(true);
    }
  });

  test("redacts Chinese sensitive names, and the pinyin a non-CJK codebase writes", () => {
    // 密码 = mima ("password"); 身份证 = shenfenzheng (identity card)
    for (const name of ["密码", "用户密码", "身份证", "mima", "shenfenzheng"]) {
      expect(p.shouldRedact(name)).toBe(true);
    }
  });

  // The deny-list is written in folded ASCII, so a team that types the accent and a team that
  // does not get the same protection. Neither spelling is the "correct" one to a field author.
  test("accented and unaccented spellings are matched alike", () => {
    expect(p.shouldRedact("contrasena")).toBe(true);
    expect(p.shouldRedact("CONTRASEÑA")).toBe(true);
    expect(p.shouldRedact("cedula")).toBe(true);
    expect(p.shouldRedact("CartãoCredito")).toBe(true);
    expect(p.shouldRedact("cartaoCredito")).toBe(true);
    // The decomposed spelling is the same word: n + U+0303 rather than U+00F1.
    expect(p.shouldRedact("contrasen\u0303a")).toBe(true);
  });

  test("non-English short names match as identifier tokens in compound names", () => {
    for (const name of [
      "rutCliente",
      "cuitEmpresa",
      "dniTitular",
      "senhaUsuario",
      "cpf_cliente",
      "CNPJ",
      "nirAssure",
      "mimaHash",
    ]) {
      expect(p.shouldRedact(name)).toBe(true);
    }
  });

  // The `pan` lesson, applied to the non-English short words: every name here contains a
  // deny-list word as a substring and is an ordinary business field; a security default that
  // blanks these gets switched off entirely, which leaks everything rather than one field.
  test("short non-English words do not blank ordinary business fields", () => {
    for (const name of [
      "truthValue",
      "bruteForceAttempts",
      "scrutinyScore",
      "circuitBreaker",
      "biscuitCount",
      "midnightCutoff",
      "chosenHash",
      "frozenHashes",
      "nirvanaLevel",
      "semiMajorAxis",
    ]) {
      expect(p.shouldRedact(name)).toBe(false);
    }
  });

  // clave/carte were narrowed out of the deny-list entirely (family ruling 2026-09-03): a token
  // match only ever protected them from someone else's compound (enclaveId, cartesianProduct),
  // never from a codebase's own (clavePrimaria, carteGraphique) — the pattern is a whole token
  // there too. The specific credential compounds are the unit instead.
  test("clave and carte stay visible, bare and in ordinary compounds", () => {
    for (const name of [
      "enclaveId",
      "conclaveDate",
      "cartesianProduct",
      "descartesPoint",
      "carteraDigital",
      "clave",
      "clavePrimaria",
      "claveForanea",
      "llavePrimaria",
      "carte",
      "carteGraphique",
      "carteRoutiere",
    ]) {
      expect(p.shouldRedact(name)).toBe(false);
    }
  });

  test("the narrowed clave/carte credential compounds are redacted, both spellings", () => {
    for (const name of [
      "claveAcceso",
      "clave_acceso",
      "claveSecreta",
      "clave_secreta",
      "carteBancaire",
      "carte_bancaire",
      "numeroCarte",
      "numero_carte",
    ]) {
      expect(p.shouldRedact(name)).toBe(true);
    }
  });
});

// Value-shape masking is a second, independent axis: it looks at what a string *is*, not what its
// field is named, so an unnamed value (a map value, a list item) still gets caught. Kept narrow —
// structural checks only, no entropy heuristics — so the false-positive rate stays near zero.
describe("RedactionPolicy.DEFAULT — value-shape masking", () => {
  const p = RedactionPolicy.DEFAULT;

  test("a JWT (three base64url segments, header starting eyJ) is redacted by shape", () => {
    const jwt =
      "eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiIxMjM0NTY3ODkwIn0.dozjgNryP4J3jVmNHl0w5N_XgL0n3I9PlFUP0THsR8U";
    expect(p.shouldRedactValue(jwt)).toBe(true);
  });

  test("a dotted string that merely looks like three segments is not a JWT", () => {
    expect(p.shouldRedactValue("a.b.c")).toBe(false);
    expect(p.shouldRedactValue("api.internal.example.com")).toBe(false);
  });

  test("a Luhn-valid 16-digit PAN is redacted by shape", () => {
    expect(p.shouldRedactValue("4111111111111111")).toBe(true);
    expect(p.shouldRedactValue("4111 1111 1111 1111")).toBe(true);
    expect(p.shouldRedactValue("4111-1111-1111-1111")).toBe(true);
  });

  // A Mastercard test PAN whose doubled digits (Luhn's every-other-digit step) exceed 9, so the
  // checksum's "subtract 9" carry rule is actually exercised, not just the no-carry case above.
  test("a Luhn-valid PAN whose doubling carries past 9 is redacted by shape", () => {
    expect(p.shouldRedactValue("5555555555554444")).toBe(true);
  });

  test("a Luhn-invalid same-length number is not redacted — an order number stays visible", () => {
    expect(p.shouldRedactValue("4111111111111112")).toBe(false);
  });

  test("a Set-Cookie-shaped value (name=value; plus a named attribute) is redacted", () => {
    expect(p.shouldRedactValue("sessionId=abc123; Path=/; HttpOnly; Secure")).toBe(true);
  });

  test("plain key=value pairs without a cookie attribute stay visible", () => {
    expect(p.shouldRedactValue("key=value")).toBe(false);
    expect(p.shouldRedactValue("name=Ada; age=36")).toBe(false);
  });

  test("an ordinary string is unaffected", () => {
    expect(p.shouldRedactValue("hello world")).toBe(false);
  });

  test("DISABLED turns value-shape masking off too", () => {
    expect(RedactionPolicy.DISABLED.shouldRedactValue("4111111111111111")).toBe(false);
  });

  test("a custom pattern list keeps value-shape masking on", () => {
    const custom = RedactionPolicy.ofPatterns(["classified"]);
    expect(custom.shouldRedactValue("4111111111111111")).toBe(true);
  });
});

describe("RedactionPolicy.isRedacted — the single member-redaction decision", () => {
  test("an explicit annotation redacts even when the name matches nothing", () => {
    expect(RedactionPolicy.DEFAULT.isRedacted("balance", true)).toBe(true);
  });

  test("the deny-list redacts an unannotated but sensitive name", () => {
    expect(RedactionPolicy.DEFAULT.isRedacted("password", false)).toBe(true);
  });

  test("neither annotation nor deny-list leaves the member unredacted", () => {
    expect(RedactionPolicy.DEFAULT.isRedacted("username", false)).toBe(false);
  });

  test("an explicit annotation beats even the DISABLED policy", () => {
    expect(RedactionPolicy.DISABLED.isRedacted("contents", true)).toBe(true);
  });
});
