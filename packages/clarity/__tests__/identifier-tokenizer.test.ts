// SPDX-License-Identifier: BUSL-1.1
// Licensed under the Business Source License 1.1 (see LICENSE); Change Date: four years from publication; Change License: Apache-2.0
// Copyright (c) 2026 Empower Agile
import { describe, expect, test } from "vitest";
import { tokenize } from "../src/identifier-tokenizer.js";

describe("IdentifierTokenizer", () => {
  test("splits camelCase into lowercase tokens", () => {
    expect(tokenize("placeOrder")).toStrictEqual(["place", "order"]);
  });

  test("splits PascalCase into lowercase tokens", () => {
    expect(tokenize("OrderService")).toStrictEqual(["order", "service"]);
  });

  test("splits acronyms followed by a word", () => {
    expect(tokenize("HTMLParser")).toStrictEqual(["html", "parser"]);
  });

  test("returns single-word identifier as one token", () => {
    expect(tokenize("order")).toStrictEqual(["order"]);
  });

  test("returns empty array for empty string", () => {
    expect(tokenize("")).toStrictEqual([]);
  });

  test("splits identifier with three or more tokens", () => {
    expect(tokenize("calculateTotalPrice")).toStrictEqual(["calculate", "total", "price"]);
  });

  test("keeps standalone acronym as single token", () => {
    expect(tokenize("HTML")).toStrictEqual(["html"]);
  });

  test("splits snake_case on underscores", () => {
    expect(tokenize("snake_case")).toStrictEqual(["snake", "case"]);
  });

  test("splits SCREAMING_SNAKE_CASE on underscores", () => {
    expect(tokenize("SCREAMING_SNAKE")).toStrictEqual(["screaming", "snake"]);
  });

  test("splits mixed_camelCase combining underscores and case transitions", () => {
    expect(tokenize("mixed_camelCase")).toStrictEqual(["mixed", "camel", "case"]);
  });

  test("splits on digit boundaries", () => {
    expect(tokenize("order2item")).toStrictEqual(["order", "2", "item"]);
  });

  test("splits digits in camelCase context", () => {
    expect(tokenize("base64Encoded")).toStrictEqual(["base", "64", "encoded"]);
  });

  test("filters empty tokens from leading/trailing underscores", () => {
    expect(tokenize("__leading_underscores__")).toStrictEqual(["leading", "underscores"]);
  });
});
