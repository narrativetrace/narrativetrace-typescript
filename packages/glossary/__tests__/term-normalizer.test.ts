// SPDX-License-Identifier: BUSL-1.1
// Licensed under the Business Source License 1.1 (see LICENSE); Change Date: four years from publication; Change License: Apache-2.0
// Copyright (c) 2026 Empower Agile
import { describe, expect, test } from "vitest";
import {
  classCandidate,
  exceptionCandidate,
  methodCandidates,
  normalizePhrase,
  parameterCandidate,
  S_FINAL_SINGULARS,
} from "../src/term-normalizer.js";

describe("normalizePhrase", () => {
  test("converges camelCase, PascalCase and snake_case on one phrase", () => {
    expect(normalizePhrase("accountWithOverdraft")).toBe("account with overdraft");
    expect(normalizePhrase("AccountWithOverdraft")).toBe("account with overdraft");
    expect(normalizePhrase("account_with_overdraft")).toBe("account with overdraft");
  });

  test("singularizes plural nouns", () => {
    expect(normalizePhrase("overdraftAccounts")).toBe("overdraft account");
    expect(normalizePhrase("entries")).toBe("entry");
    expect(normalizePhrase("addresses")).toBe("address");
    expect(normalizePhrase("taxBoxes")).toBe("tax box");
  });

  test("keeps words whose trailing s is not a plural", () => {
    expect(normalizePhrase("status")).toBe("status");
    expect(normalizePhrase("analysis")).toBe("analysis");
    expect(normalizePhrase("progress")).toBe("progress");
  });

  test("reads the trailing letters, not the leading ones, to spot a non-plural s", () => {
    // `users` begins with "us" and ends with "rs": a rule that looked at the start of the token
    // would keep it whole and quietly split the vocabulary for "user".
    expect(normalizePhrase("users")).toBe("user");
    expect(normalizePhrase("issues")).toBe("issue");
  });

  test("never singularizes a function word", () => {
    expect(normalizePhrase("markedAsDone")).toBe("marked as done");
    expect(normalizePhrase("chargeWasApplied")).toBe("charge was applied");
  });

  test("keeps a two-letter word that ends in s", () => {
    expect(normalizePhrase("isPaid")).toBe("is paid");
  });

  test("splits an acronym followed by a word", () => {
    expect(normalizePhrase("HTMLInvoiceRenderer")).toBe("html invoice renderer");
  });

  test.each([...S_FINAL_SINGULARS])("keeps the s-final singular '%s' whole", (word) => {
    // Walks the real list, so a word added to it cannot go untested: each has to survive
    // normalization, and has to be what its own -es plural singularizes back to.
    expect(normalizePhrase(word)).toBe(word);
    expect(normalizePhrase(`${word}es`)).toBe(word);
  });

  test("keeps a word that ends in s but is already singular", () => {
    expect(normalizePhrase("alias")).toBe("alias");
    expect(normalizePhrase("gas")).toBe("gas");
    expect(normalizePhrase("bonusCampus")).toBe("bonus campus");
  });

  test("keeps an invariant plural whole rather than inventing a y-stem", () => {
    expect(normalizePhrase("series")).toBe("series");
    expect(normalizePhrase("species")).toBe("species");
  });

  test("keeps the e of a plural built from a stem already ending in se", () => {
    expect(normalizePhrase("useCases")).toBe("use case");
    expect(normalizePhrase("clauses")).toBe("clause");
    expect(normalizePhrase("responses")).toBe("response");
  });

  test("strips es only when the stem it leaves is itself a singular", () => {
    expect(normalizePhrase("gases")).toBe("gas");
    expect(normalizePhrase("statuses")).toBe("status");
    expect(normalizePhrase("addresses")).toBe("address");
  });

  test("leaves a bare token too short for any plural rule alone", () => {
    expect(normalizePhrase("s")).toBe("s");
    expect(normalizePhrase("ies")).toBe("ie");
    expect(normalizePhrase("ses")).toBe("se");
  });

  test("needs more than three letters before reading a trailing es as a plural", () => {
    // Without the length guard these lose two letters instead of one ("xes" → "x"), which is how
    // a three-letter identifier gets normalized down to a single letter that names nothing.
    expect(normalizePhrase("xes")).toBe("xe");
    expect(normalizePhrase("zes")).toBe("ze");
    // Four letters is enough, and then the stem is what survives.
    expect(normalizePhrase("ches")).toBe("ch");
  });

  test("rejects an identifier that is blank", () => {
    expect(() => normalizePhrase("")).toThrow("identifier must not be blank");
    expect(() => normalizePhrase("   ")).toThrow("identifier must not be blank");
  });

  test("rejects an identifier that holds no word characters at all", () => {
    expect(() => normalizePhrase("___")).toThrow("identifier holds no word characters: '___'");
    expect(() => normalizePhrase("!!!")).toThrow("identifier holds no word characters: '!!!'");
  });
});

describe("methodCandidates", () => {
  test("splits a verb method into its verb phrase and its object noun phrase", () => {
    expect(methodCandidates("openAccountWithOverdraft")).toStrictEqual([
      { phrase: "open account with overdraft", kind: "verb-phrase" },
      { phrase: "account with overdraft", kind: "noun-phrase" },
    ]);
  });

  test("yields a word candidate when the object is a single token", () => {
    expect(methodCandidates("chargeCards")).toStrictEqual([
      { phrase: "charge card", kind: "verb-phrase" },
      { phrase: "card", kind: "word" },
    ]);
  });

  test("yields only the verb phrase for a bare verb", () => {
    expect(methodCandidates("charge")).toStrictEqual([{ phrase: "charge", kind: "verb-phrase" }]);
  });

  test("yields a noun candidate when the method does not start with a verb", () => {
    expect(methodCandidates("overdraftLimit")).toStrictEqual([
      { phrase: "overdraft limit", kind: "noun-phrase" },
    ]);
  });

  test("drops leading function words from the object phrase", () => {
    expect(methodCandidates("checkForDuplicates")).toStrictEqual([
      { phrase: "check for duplicate", kind: "verb-phrase" },
      { phrase: "duplicate", kind: "word" },
    ]);
  });

  test("yields only the verb phrase when the object is nothing but function words", () => {
    expect(methodCandidates("checkFor")).toStrictEqual([
      { phrase: "check for", kind: "verb-phrase" },
    ]);
  });

  test("treats a verb known only by its suffix as a verb", () => {
    expect(methodCandidates("gamifyRewards")).toStrictEqual([
      { phrase: "gamify reward", kind: "verb-phrase" },
      { phrase: "reward", kind: "word" },
    ]);
  });

  test("drops every declared function word from the head of an object phrase", () => {
    const stopwords = [
      "with",
      "and",
      "or",
      "of",
      "to",
      "for",
      "by",
      "from",
      "in",
      "on",
      "at",
      "as",
      "was",
      "is",
      "has",
    ];

    for (const stopword of stopwords) {
      const capitalized = stopword.charAt(0).toUpperCase() + stopword.slice(1);

      expect(methodCandidates(`check${capitalized}Duplicates`)).toStrictEqual([
        { phrase: `check ${stopword} duplicate`, kind: "verb-phrase" },
        { phrase: "duplicate", kind: "word" },
      ]);
    }
  });

  test("rejects a blank method name", () => {
    expect(() => methodCandidates(" ")).toThrow("method name must not be blank");
  });
});

describe("parameterCandidate", () => {
  test("strips the trailing id role token", () => {
    expect(parameterCandidate("overdraftAccountId")).toStrictEqual({
      phrase: "overdraft account",
      kind: "noun-phrase",
    });
    expect(parameterCandidate("customerIds")).toStrictEqual({ phrase: "customer", kind: "word" });
  });

  test("yields nothing when only the role token remains", () => {
    expect(parameterCandidate("id")).toBeUndefined();
    expect(parameterCandidate("ids")).toBeUndefined();
  });

  test("keeps an id that is not in trailing position", () => {
    expect(parameterCandidate("idempotencyKey")).toStrictEqual({
      phrase: "idempotency key",
      kind: "noun-phrase",
    });
  });

  test("rejects a blank parameter name", () => {
    expect(() => parameterCandidate("")).toThrow("parameter name must not be blank");
  });
});

describe("classCandidate", () => {
  test("strips a recognized role suffix", () => {
    expect(classCandidate("OverdraftService")).toStrictEqual({
      phrase: "overdraft",
      kind: "word",
    });
    expect(classCandidate("PaymentPlanRepository")).toStrictEqual({
      phrase: "payment plan",
      kind: "noun-phrase",
    });
  });

  test("keeps a trailing token that is not a role suffix", () => {
    expect(classCandidate("InvoiceLineItem")).toStrictEqual({
      phrase: "invoice line item",
      kind: "noun-phrase",
    });
  });

  test("yields nothing when the class name is only a role suffix", () => {
    expect(classCandidate("Service")).toBeUndefined();
  });

  test("rejects a blank class name", () => {
    expect(() => classCandidate("")).toThrow("class name must not be blank");
  });
});

describe("exceptionCandidate", () => {
  test("strips the Exception and Error suffixes", () => {
    expect(exceptionCandidate("InsufficientFundsException")).toStrictEqual({
      phrase: "insufficient fund",
      kind: "noun-phrase",
    });
    expect(exceptionCandidate("TimeoutError")).toStrictEqual({ phrase: "timeout", kind: "word" });
  });

  test("yields nothing when the type name is only the suffix", () => {
    expect(exceptionCandidate("Exception")).toBeUndefined();
    expect(exceptionCandidate("Error")).toBeUndefined();
  });

  test("keeps a type name that carries no failure suffix", () => {
    expect(exceptionCandidate("OverdraftRefused")).toStrictEqual({
      phrase: "overdraft refused",
      kind: "noun-phrase",
    });
  });

  test("rejects a blank type name", () => {
    expect(() => exceptionCandidate("")).toThrow("exception type name must not be blank");
  });
});
