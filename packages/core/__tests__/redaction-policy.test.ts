// SPDX-License-Identifier: BUSL-1.1
// Licensed under the Business Source License 1.1 (see LICENSE); Change Date: four years from publication; Change License: Apache-2.0
// Copyright (c) 2026 Empower Agile
import { describe, expect, test } from "vitest";
import { RedactionPolicy } from "../src/redaction-policy.js";
import { renderValue } from "../src/value-renderer.js";

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

// Family-wide audit (2026-09): these ten terms were absent from every runtime's deny list,
// including this one. Long/specific enough that bare-substring matching does not need the
// token-boundary carve-out `pan`/`iban` need — see the dedicated `otp` describe block below for
// the one addition from this batch that does need it.
describe("RedactionPolicy.DEFAULT — 2026-09 family-wide audit additions", () => {
  const p = RedactionPolicy.DEFAULT;

  test("redacts every newly reported name, bare", () => {
    for (const name of [
      "passphrase",
      "bearer",
      "accesskey",
      "access_key",
      "socialsecurity",
      "social_security",
      "socialsecuritynumber",
      "taxid",
      "tax_id",
      "passwort",
      "kennwort",
    ]) {
      expect(p.shouldRedact(name)).toBe(true);
    }
  });

  // Every compound below is chosen to avoid any OTHER, pre-existing deny-list pattern — e.g.
  // NOT "bearerToken" (already redacted via the pre-existing "token", proving nothing about
  // "bearer") — so a pass here is evidence for the specific new pattern under test, not an
  // accident of an unrelated one. `BearerAuthHeader` deliberately avoids "authorization" too.
  test("matches case-insensitively inside realistic compound field names", () => {
    expect(p.shouldRedact("userPassphrase")).toBe(true);
    expect(p.shouldRedact("BearerAuthHeader")).toBe(true);
    expect(p.shouldRedact("customerAccessKey")).toBe(true);
    expect(p.shouldRedact("employeeSocialSecurityNumber")).toBe(true);
    expect(p.shouldRedact("customerTaxId")).toBe(true);
    expect(p.shouldRedact("MeinPasswort")).toBe(true);
    expect(p.shouldRedact("IhrKennwort")).toBe(true);
  });
});

// `otp` earned the same token-boundary treatment as `pan`/`iban`: a bare substring match would
// blank ordinary business fields sharing the letter run (`carbonFootprintId`, `hotplateTemp`,
// `footpathLength`) — the exact shape that carve-out exists for. A camelCase/snake_case/all-caps
// OTP field still yields its own `otp` token, so the boundary match loses nothing real.
describe("RedactionPolicy.DEFAULT — otp matches tokens, never a bare substring", () => {
  const p = RedactionPolicy.DEFAULT;

  // "OTP_CODE"/"otp_code" (not "OTP_SECRET") deliberately: the latter would already redact via
  // the pre-existing "secret" pattern regardless of otp, proving nothing about this addition.
  test("redacts otp as a whole token, in any casing/compound position", () => {
    for (const name of ["otp", "OTP", "otpCode", "userOtp", "OTP_CODE", "otp_code"]) {
      expect(p.shouldRedact(name)).toBe(true);
    }
  });

  test("does not redact ordinary business fields that merely contain the letters", () => {
    for (const name of ["footprintId", "carbonFootprint", "hotplateTemp", "footpathLength"]) {
      expect(p.shouldRedact(name)).toBe(false);
    }
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

// A US SSN has no check digit — nine bare digits are indistinguishable from an order number, an
// account id, or an unpunctuated phone number, so only the dashed AAA-GG-SSSS form is recognised;
// the punctuation is the only evidence the writer meant an SSN (same reasoning the RUT matcher in
// other runtimes uses for its own required dash). The SSA's structural rules — area 000/666/9xx,
// group 00, serial 0000 are never issued — stand in for the missing checksum, and rejecting them
// costs nothing real while keeping the 000-00-0000 placeholder that fills test fixtures visible.
describe("RedactionPolicy.DEFAULT — US Social Security Number (dashed AAA-GG-SSSS only)", () => {
  const p = RedactionPolicy.DEFAULT;

  test("a valid dashed SSN is redacted by shape", () => {
    for (const ssn of ["123-45-6789", "001-01-0001", "899-99-9999"]) {
      expect(p.shouldRedactValue(ssn)).toBe(true);
    }
  });

  // The whole point of the value axis: no name gives it away, only the bytes.
  test("caught under an innocuous field name, through a real renderer", () => {
    const rendered = renderValue({ taxpayerRef: "123-45-6789" });
    expect(rendered).toContain("[REDACTED]");
    expect(rendered).not.toContain("123-45-6789");
  });

  test("bare or mis-grouped digits are not matched — an SSN has no check digit to fall back on", () => {
    for (const value of [
      "123456789", // bare, no dashes at all
      "12-345-6789", // wrong grouping
      "123-456-789", // wrong grouping
      "123-45-678", // serial one digit short
      "123-45-67890", // serial one digit long
    ]) {
      expect(p.shouldRedactValue(value)).toBe(false);
    }
  });

  test("never-issued area/group/serial combinations stay visible", () => {
    for (const value of [
      "000-12-3456", // area 000
      "666-12-3456", // area 666
      "900-12-3456", // area in the never-issued 900-999 band
      "123-00-4567", // group 00
      "123-45-0000", // serial 0000
      "000-00-0000", // the placeholder that fills test fixtures and redacted forms everywhere
    ]) {
      expect(p.shouldRedactValue(value)).toBe(false);
    }
  });

  test("an ordinary nine-digit order number stays visible through a real renderer", () => {
    const rendered = renderValue({ orderNumber: "123456789" });
    expect(rendered).toContain("123456789");
    expect(rendered).not.toContain("[REDACTED]");
  });
});

// National identity numbers (2026-09-10, family-wide): six more value shapes, ported from Java's
// NationalIdShapes (national-id-shapes.ts). Every one of these is a real CHECKSUM (unlike the
// SSN's structural-rule fallback above), so — unlike SSN — a bare, unpunctuated digit run is
// never accepted either: the checksum itself is the false-positive guard. Values below are the
// exact rows redaction.json (the shared hostile corpus) carries, chosen to hit every accept/reject
// branch (formatted vs bare, valid vs bad check digit, the repeated-digit placeholder guard, and
// per-scheme edge cases like Corsica's department code and an implausible birth month).
describe("RedactionPolicy.DEFAULT — Chilean RUT (mod-11 verifier, dash required)", () => {
  const p = RedactionPolicy.DEFAULT;

  test("a valid RUT is redacted by shape — dotted, plain, short-body, and the K/0 verifier edges", () => {
    for (const value of [
      "12.345.678-5", // thousands-dot formatting
      "12345678-5", // bare 8-digit body
      "1234567-4", // 7-digit body
      "10000013-K", // verifier computes to the letter K
      "10000004-0", // verifier computes to the rest===11 edge, written 0
    ]) {
      expect(p.shouldRedactValue(value)).toBe(true);
    }
  });

  test("a wrong verifier or a missing dash stays visible", () => {
    expect(p.shouldRedactValue("12345678-6")).toBe(false); // verifier should be 5, not 6
    // No separator at all: indistinguishable from an ordinary nine-digit order number — the
    // whole reason this scheme requires its dash (see the module's own doc comment).
    expect(p.shouldRedactValue("123456785")).toBe(false);
  });
});

describe("RedactionPolicy.DEFAULT — Brazilian CPF (mod-11 double check digit)", () => {
  const p = RedactionPolicy.DEFAULT;

  test("a valid CPF is redacted by shape, formatted or bare", () => {
    expect(p.shouldRedactValue("529.982.247-25")).toBe(true);
    expect(p.shouldRedactValue("52998224725")).toBe(true);
    // The mod-11 remainder for this body's first check digit is 0 — the "remainder under two
    // means a zero digit" branch the other examples above never take (theirs land on 11 minus
    // the remainder instead).
    expect(p.shouldRedactValue("10000000108")).toBe(true);
  });

  test("a wrong check digit stays visible", () => {
    expect(p.shouldRedactValue("52998224726")).toBe(false);
  });

  test("repeated-digit placeholders stay visible even though they pass the checksum", () => {
    // Every repeated-digit string satisfies CPF's mod-11 checksum by construction; this is what a
    // form writes when it has no real document, not a document itself (see the module doc comment).
    expect(p.shouldRedactValue("11111111111")).toBe(false);
    expect(p.shouldRedactValue("99999999999")).toBe(false);
  });
});

describe("RedactionPolicy.DEFAULT — Brazilian CNPJ (mod-11 double check digit)", () => {
  const p = RedactionPolicy.DEFAULT;

  test("a valid CNPJ is redacted by shape, formatted or bare", () => {
    expect(p.shouldRedactValue("11.222.333/0001-81")).toBe(true);
    expect(p.shouldRedactValue("11222333000181")).toBe(true);
  });

  test("a wrong check digit stays visible", () => {
    expect(p.shouldRedactValue("11222333000182")).toBe(false);
  });

  test("a repeated-digit placeholder stays visible, rejected before the checksum even runs", () => {
    // Not all-zeros: fourteen zeros is coincidentally also a Luhn-valid PAN-length number, which
    // would prove this assertion for the wrong reason (PAN's matcher, not CNPJ's repeated-digit
    // guard) — exactly the incidental-collision trap this port's own audits keep finding.
    expect(p.shouldRedactValue("11111111111111")).toBe(false);
  });
});

describe("RedactionPolicy.DEFAULT — Spanish DNI/NIE (mod-23 check letter)", () => {
  const p = RedactionPolicy.DEFAULT;

  test("a valid DNI or NIE is redacted by shape", () => {
    expect(p.shouldRedactValue("12345678Z")).toBe(true); // DNI, no hyphen
    expect(p.shouldRedactValue("12345678-Z")).toBe(true); // DNI, hyphenated
    expect(p.shouldRedactValue("X1234567L")).toBe(true); // NIE, X = 0
    expect(p.shouldRedactValue("Y1234567X")).toBe(true); // NIE, Y = 1
    expect(p.shouldRedactValue("Z1234567R")).toBe(true); // NIE, Z = 2
  });

  test("a wrong check letter stays visible", () => {
    expect(p.shouldRedactValue("12345678A")).toBe(false);
    expect(p.shouldRedactValue("X1234567A")).toBe(false);
  });
});

describe("RedactionPolicy.DEFAULT — French NIR (mod-97 key)", () => {
  const p = RedactionPolicy.DEFAULT;

  test("a valid NIR is redacted by shape — compact, spaced, and Corsica's 2A/2B department", () => {
    expect(p.shouldRedactValue("184127645108946")).toBe(true);
    expect(p.shouldRedactValue("1 84 12 76 451 089 46")).toBe(true);
    expect(p.shouldRedactValue("175032A12345606")).toBe(true); // Corsica, 2A
    expect(p.shouldRedactValue("180022B75123469")).toBe(true); // Corsica, 2B
  });

  test("a wrong key stays visible", () => {
    expect(p.shouldRedactValue("184127645108947")).toBe(false);
  });
});

describe("RedactionPolicy.DEFAULT — Chinese resident identity card (weighted mod-11 check character)", () => {
  const p = RedactionPolicy.DEFAULT;

  test("a valid id is redacted by shape, X check character or numeric", () => {
    expect(p.shouldRedactValue("11010519491231002X")).toBe(true);
    expect(p.shouldRedactValue("440301199001010012")).toBe(true);
  });

  test("a wrong check character, an impossible month, or an implausible birth year stays visible", () => {
    expect(p.shouldRedactValue("110105194912310021")).toBe(false); // wrong check character
    expect(p.shouldRedactValue("110105194913320019")).toBe(false); // month 13
    expect(p.shouldRedactValue("110105189912310007")).toBe(false); // birth year 1899, before the floor
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
