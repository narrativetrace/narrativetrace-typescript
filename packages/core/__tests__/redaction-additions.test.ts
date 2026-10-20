// SPDX-License-Identifier: BUSL-1.1
// Licensed under the Business Source License 1.1 (see LICENSE); Change Date: four years from publication; Change License: Apache-2.0
// Copyright (c) 2026 Empower Agile
import { afterEach, describe, expect, test } from "vitest";
import { RedactionPolicy, registerAdditionalRedactionPatterns } from "../src/redaction-policy.js";

describe("operator-supplied redaction additions", () => {
  afterEach(() => registerAdditionalRedactionPatterns(undefined));

  test("no configuration adds nothing", () => {
    for (const raw of [undefined, "", "   ", ",", " , "]) {
      registerAdditionalRedactionPatterns(raw);
      expect(RedactionPolicy.DEFAULT.shouldRedact("betalingskort")).toBe(false);
    }
  });

  test("additions widen the default vocabulary rather than replacing it", () => {
    registerAdditionalRedactionPatterns("betalingskort");
    const policy = RedactionPolicy.DEFAULT;
    expect(policy.shouldRedact("betalingskort")).toBe(true);
    expect(policy.shouldRedact("kundeBetalingskortNummer")).toBe(true);
    expect(policy.shouldRedact("password")).toBe(true);
    expect(policy.shouldRedact("contraseña")).toBe(true);
  });

  test("patterns are comma-separated, trimmed, and empty entries are dropped", () => {
    registerAdditionalRedactionPatterns(" alpha , beta ,,gamma");
    const policy = RedactionPolicy.DEFAULT;
    expect(["alpha", "beta", "gamma"].map((n) => policy.shouldRedact(n))).toEqual([
      true,
      true,
      true,
    ]);
    // an empty entry must not become "", whose substring test matches every field name
    expect(policy.shouldRedact("orderTotal")).toBe(false);
  });

  test("additions are folded for case and accents like the built-ins", () => {
    registerAdditionalRedactionPatterns("Kontonummer, Mot Clé");
    const policy = RedactionPolicy.DEFAULT;
    expect(policy.shouldRedact("KONTONUMMER")).toBe(true);
    expect(policy.shouldRedact("kundeKontonummer")).toBe(true);
    expect(policy.shouldRedact("mot cle")).toBe(true);
  });

  test("a policy built by ofPatterns still carries the additions, and still replaces the defaults", () => {
    registerAdditionalRedactionPatterns("betalingskort");
    const policy = RedactionPolicy.ofPatterns(["ssn"]);
    expect(policy.shouldRedact("taxSsn")).toBe(true);
    expect(policy.shouldRedact("betalingskort")).toBe(true);
    expect(policy.shouldRedact("password")).toBe(false);
  });

  test("a policy constructed before the registration sees it", () => {
    const policy = RedactionPolicy.ofPatterns(["ssn"]);
    registerAdditionalRedactionPatterns("betalingskort");
    expect(policy.shouldRedact("betalingskort")).toBe(true);
  });

  test("DISABLED ignores the additions", () => {
    registerAdditionalRedactionPatterns("betalingskort");
    expect(RedactionPolicy.DISABLED.shouldRedact("betalingskort")).toBe(false);
  });

  test("a later registration replaces the earlier one", () => {
    registerAdditionalRedactionPatterns("alpha");
    registerAdditionalRedactionPatterns("beta");
    expect(RedactionPolicy.DEFAULT.shouldRedact("alpha")).toBe(false);
    expect(RedactionPolicy.DEFAULT.shouldRedact("beta")).toBe(true);
  });

  test("an addition that is a token-boundary word keeps whole-token matching", () => {
    registerAdditionalRedactionPatterns("pan");
    expect(RedactionPolicy.ofPatterns([]).shouldRedact("companyName")).toBe(false);
    expect(RedactionPolicy.ofPatterns([]).shouldRedact("card_pan")).toBe(true);
  });

  test("a short addition blanks every field containing it (the documented id trap)", () => {
    registerAdditionalRedactionPatterns("id");
    expect(RedactionPolicy.DEFAULT.shouldRedact("orderId")).toBe(true);
  });
});
