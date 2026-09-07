// SPDX-License-Identifier: BUSL-1.1
// Licensed under the Business Source License 1.1 (see LICENSE); Change Date: four years from publication; Change License: Apache-2.0
// Copyright (c) 2026 Empower Agile
import { describe, expect, test } from "vitest";
import { abbreviationScore, classifyAbbreviation } from "../src/abbreviation-dictionary.js";

describe("AbbreviationDictionary", () => {
  test("identifies universal abbreviations", () => {
    expect(classifyAbbreviation("id")).toBe("universal");
    expect(classifyAbbreviation("url")).toBe("universal");
    expect(classifyAbbreviation("api")).toBe("universal");
    expect(classifyAbbreviation("db")).toBe("universal");
    expect(classifyAbbreviation("io")).toBe("universal");
  });

  test("identifies well-known abbreviations", () => {
    expect(classifyAbbreviation("config")).toBe("wellKnown");
    expect(classifyAbbreviation("auth")).toBe("wellKnown");
    expect(classifyAbbreviation("ctx")).toBe("wellKnown");
    expect(classifyAbbreviation("req")).toBe("wellKnown");
    expect(classifyAbbreviation("impl")).toBe("wellKnown");
  });

  test("identifies ambiguous abbreviations", () => {
    expect(classifyAbbreviation("proc")).toBe("ambiguous");
    expect(classifyAbbreviation("srv")).toBe("ambiguous");
    expect(classifyAbbreviation("rag")).toBe("ambiguous");
  });

  test("returns undefined for unknown or full words", () => {
    expect(classifyAbbreviation("xyz")).toBeUndefined();
    expect(classifyAbbreviation("ab")).toBeUndefined();
    expect(classifyAbbreviation("customer")).toBeUndefined();
    expect(classifyAbbreviation("order")).toBeUndefined();
    expect(classifyAbbreviation("validate")).toBeUndefined();
  });

  test("is case-insensitive", () => {
    expect(classifyAbbreviation("URL")).toBe("universal");
    expect(classifyAbbreviation("Config")).toBe("wellKnown");
  });

  test("returns numerical scores for each tier", () => {
    expect(abbreviationScore("universal")).toBe(1.0);
    expect(abbreviationScore("wellKnown")).toBe(0.8);
    expect(abbreviationScore("ambiguous")).toBe(0.5);
  });

  test("covers universal abbreviations", () => {
    const universal = [
      "http",
      "html",
      "css",
      "sql",
      "xml",
      "json",
      "ui",
      "os",
      "ip",
      "tcp",
      "udp",
      "ssh",
      "ssl",
      "tls",
      "jwt",
      "uri",
      "dns",
    ];
    for (const abbr of universal) {
      expect(classifyAbbreviation(abbr), abbr).toBe("universal");
    }
  });

  test("covers well-known abbreviations", () => {
    const wellKnown = [
      "env",
      "cfg",
      "msg",
      "res",
      "err",
      "fn",
      "cb",
      "init",
      "util",
      "lib",
      "src",
      "pkg",
      "doc",
      "spec",
      "param",
      "opt",
      "ref",
      "str",
      "num",
      "obj",
      "buf",
      "ttl",
      "llm",
      "gdpr",
    ];
    for (const abbr of wellKnown) {
      expect(classifyAbbreviation(abbr), abbr).toBe("wellKnown");
    }
  });

  test("empty string returns undefined (zero length)", () => {
    expect(classifyAbbreviation("")).toBeUndefined();
  });

  test("tier scores are strictly ordered", () => {
    expect(abbreviationScore("universal")).toBeGreaterThan(abbreviationScore("wellKnown"));
    expect(abbreviationScore("wellKnown")).toBeGreaterThan(abbreviationScore("ambiguous"));
  });

  test("recognizes promoted platform/security/data/ai abbreviations", () => {
    expect(classifyAbbreviation("ttl")).toBe("wellKnown");
    expect(classifyAbbreviation("slo")).toBe("wellKnown");
    expect(classifyAbbreviation("mfa")).toBe("universal");
    expect(classifyAbbreviation("gdpr")).toBe("wellKnown");
    expect(classifyAbbreviation("llm")).toBe("wellKnown");
  });
});
