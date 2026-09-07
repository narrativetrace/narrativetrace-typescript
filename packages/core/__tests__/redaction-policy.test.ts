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
