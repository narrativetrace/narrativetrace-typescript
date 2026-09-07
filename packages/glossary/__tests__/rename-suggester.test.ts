// SPDX-License-Identifier: BUSL-1.1
// Licensed under the Business Source License 1.1 (see LICENSE); Change Date: four years from publication; Change License: Apache-2.0
// Copyright (c) 2026 Empower Agile
import { describe, expect, test } from "vitest";
import { suggestRename } from "../src/rename-suggester.js";

const ALIAS = "account with overdraft";
const CANONICAL = "overdraft account";

describe("suggestRename", () => {
  test("splices the canonical term into a camelCase identifier", () => {
    expect(suggestRename("openAccountWithOverdraft", ALIAS, CANONICAL)).toBe(
      "openOverdraftAccount",
    );
  });

  test("keeps a PascalCase identifier in PascalCase", () => {
    expect(suggestRename("AccountWithOverdraftService", ALIAS, CANONICAL)).toBe(
      "OverdraftAccountService",
    );
  });

  test("keeps a snake_case identifier in snake_case", () => {
    expect(suggestRename("open_account_with_overdraft", ALIAS, CANONICAL)).toBe(
      "open_overdraft_account",
    );
  });

  test("matches the alias through the plural spellings normalization folds together", () => {
    expect(suggestRename("openAccountsWithOverdrafts", ALIAS, CANONICAL)).toBe(
      "openOverdraftAccount",
    );
  });

  test("leaves the tokens around the alias spelled exactly as they were", () => {
    expect(suggestRename("accountWithOverdraftDTO", ALIAS, CANONICAL)).toBe("overdraftAccountDTO");
    expect(suggestRename("openDTOAccountWithOverdraft", ALIAS, CANONICAL)).toBe(
      "openDTOOverdraftAccount",
    );
  });

  test("splits an acronym from the word that follows it", () => {
    // Known limitation, shared with the Java reference: the leading token is always re-cased, so a
    // PascalCase identifier that starts with an acronym loses its capitals. Every other token keeps
    // its spelling, which is why only the first one is affected.
    expect(suggestRename("DTOAccountWithOverdraft", ALIAS, CANONICAL)).toBe("DtoOverdraftAccount");
  });

  test("splits digits from the letters on either side of them", () => {
    expect(suggestRename("v2OpenAccountWithOverdraft", ALIAS, CANONICAL)).toBe(
      "v2OpenOverdraftAccount",
    );
  });

  test("known limitation: a lowercase token after a digit merges into the spliced term", () => {
    // A digit is a token boundary that needs no capital, so `open` is lowercase in the original.
    // Splicing letters in front of it removes the boundary and the two read as one token: the
    // suggestion is a legal identifier but no longer means what it did. Shared with the Java
    // reference (`RenameSuggester.joinCamel`), so it is kept at parity rather than fixed here.
    // Suggestions are advisory text, so the glossary itself is unaffected.
    expect(suggestRename("DTO2open2", "2", "zzz")).toBe("DtoZzzopen2");
  });

  test("ignores the empty token a leading underscore would otherwise produce", () => {
    expect(suggestRename("_account_with_overdraft", ALIAS, CANONICAL)).toBe("overdraft_account");
  });

  test("renames a single-token alias", () => {
    expect(suggestRename("billParcel", "parcel", "shipment")).toBe("billShipment");
    expect(suggestRename("Parcel", "parcel", "shipment")).toBe("Shipment");
  });

  test("returns undefined when the alias does not appear in the identifier", () => {
    expect(suggestRename("openAccount", ALIAS, CANONICAL)).toBeUndefined();
  });

  test("returns undefined when the alias tokens appear but not contiguously", () => {
    expect(suggestRename("accountReopenedWithOverdraft", ALIAS, CANONICAL)).toBeUndefined();
  });

  test.each([
    ["identifier", "", ALIAS, CANONICAL],
    ["alias phrase", "openAccount", "  ", CANONICAL],
    ["canonical phrase", "openAccount", ALIAS, ""],
  ])("rejects a blank %s", (what, identifier, alias, canonical) => {
    expect(() => suggestRename(identifier, alias, canonical)).toThrow(
      new TypeError(`${what} must not be blank`),
    );
  });
});
