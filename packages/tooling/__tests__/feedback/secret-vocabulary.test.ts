// SPDX-License-Identifier: BUSL-1.1
// Licensed under the Business Source License 1.1 (see LICENSE); Change Date: four years from publication; Change License: Apache-2.0
// Copyright (c) 2026 Empower Agile
import { describe, expect, test } from "vitest";
import {
  canonicalKey,
  containsASecretShape,
  namesASecret,
} from "../../src/feedback/secret-vocabulary.js";

/**
 * The vocabulary's own unit tests: one example per shape family, plus the near miss each family
 * must let through.
 *
 * INTENT: the shared `hostile-corpus/feedback.json` replay is the cross-runtime contract, and it
 * lives in `packages/security-tests` — a different package. This package's own mutation run only
 * executes THIS package's tests, so without these cases every shape pattern was measured as
 * untested: a mutant that narrowed the JWT pattern survived here while the corpus row that would
 * have caught it sat in a suite Stryker never ran. The corpus stays the authority on which shapes
 * matter; these are the examples that keep the measurement honest where the implementation lives.
 *
 * @llmNote The near misses carry equal weight. A shape rule's expensive failure is the one that
 * refuses a report nobody could then file — an ISO date, an invoice number, a version coordinate —
 * so each family is asserted in both directions.
 */
describe("the shapes a value gives itself away by", () => {
  test.each([
    ["a JWT", "eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiJhZGEifQ.dBjftJeZ4CVPmB92K27uhbUJU1p1r_wW1gFWFOEjXk"],
    ["a PEM private-key header", "-----BEGIN RSA PRIVATE KEY-----"],
    ["a PEM header with no algorithm", "-----BEGIN PRIVATE KEY-----"],
    ["a classic personal access token", "ghp_0123456789abcdefghij"],
    ["a fine-grained token", "github_pat_11ABCDEFG0abcdefghij"],
    ["an sk- prefixed key", "sk-abcdefghijklmnop0123"],
    ["an AWS access key id", "AKIAIOSFODNN7EXAMPLE"],
    ["a bot token", "xoxb-1234-5678-abcdefghij"],
    ["a user token", "xoxp-1234-5678-abcdefghij"],
    ["a printed Chilean identifier", "12.345.678-5"],
    ["the same identifier bare", "12345678-5"],
    ["one whose verifier is written K", "10000013-K"],
    ["a bare Brazilian individual number", "52998224725"],
    ["a printed Brazilian company number", "11.222.333/0001-81"],
    ["a Spanish foreigner number", "X1234567L"],
    ["a Spanish national number", "12345678Z"],
    ["a spaced French social-security number", "1 84 12 76 451 089 46"],
    ["a Corsican French one", "1 84 12 2A 451 089 46"],
    ["a Chinese resident identity card", "11010519491231002X"],
    ["a payment card number", "4111111111111111"],
  ])("refuses %s", (_what, value) => {
    expect(containsASecretShape(value), value).toBe(true);
  });

  test.each([
    ["an install coordinate", "@narrativetrace/core@0.2.0"],
    ["a third-party coordinate", "vitest@3.2.7"],
    ["a doctor finding id", "trap.redaction-proof"],
    ["an ISO date in a sentence", "on 2026-09-02 the doctor reported two findings"],
    ["a nine-digit invoice number", "invoice 987654321 was the one that failed"],
    ["a short hex word", "deadbeefcafe showed up in the stack trace"],
    ["a word that merely starts with the token prefix", "skew-corrected"],
    ["a word that merely starts with the key prefix", "ghpages"],
    ["a sentence about a key without one in it", "the private key was never read"],
    ["a hyphenated phrase", "the-quick-brown-fox-jumps-over-the-lazy-dog"],
    ["a structural artifact path", "narrativetrace-output/structural/OrderServiceTest/order.nt"],
    ["a version range", "^1.0.0 || ^2.0.0 || ^3.0.0"],
  ])("lets %s through", (_what, value) => {
    expect(containsASecretShape(value), value).toBe(false);
  });
});

describe("the names a key gives itself away by", () => {
  test.each([
    ["the English baseline", "userPassword"],
    ["a German spelling", "kennwort"],
    ["a French spelling with separators", "mot_de_passe"],
    ["a Portuguese spelling", "senhaUsuario"],
    ["a Chinese spelling", "用户密码"],
    ["its pinyin", "mimaHash"],
    ["an accented Spanish spelling", "contraseña"],
    ["the unaccented spelling of the same word", "contrasena"],
    ["an uppercase environment name", "NARRATIVETRACE_API_KEY"],
    ["a one-time-code field", "mfaCode"],
    ["a time-based one-time-code field", "totpSecret"],
  ])("refuses %s", (_what, key) => {
    expect(namesASecret(key), key).toBe(true);
  });

  test.each([
    ["a header field", "header"],
    ["an ordinary identifier", "customerId"],
    ["a scenario name", "scenario"],
    ["a doctor finding field", "docUrl"],
  ])("lets %s through", (_what, key) => {
    expect(namesASecret(key), key).toBe(false);
  });

  test("folds case and diacritics, composed or decomposed, to one spelling", () => {
    const decomposed = `contrasen${String.fromCodePoint(0x0303)}a`;

    expect(canonicalKey("CONTRASEÑA")).toBe("contrasena");
    expect(canonicalKey(decomposed)).toBe("contrasena");
    expect(canonicalKey("contraseña")).toBe("contrasena");
  });

  test("does NOT fold separators away, which is why two spellings are two terms", () => {
    expect(canonicalKey("api_key")).toBe("api_key");
    expect(namesASecret("api_key")).toBe(true);
    expect(namesASecret("apiKey")).toBe(true);
  });
});
