// SPDX-License-Identifier: BUSL-1.1
// Licensed under the Business Source License 1.1 (see LICENSE); Change Date: four years from publication; Change License: Apache-2.0
// Copyright (c) 2026 Empower Agile
import { describe, expect, test } from "vitest";
import { generateAlias } from "../src/alias-generator.js";

describe("generateAlias", () => {
  test("generates non-empty alias for empty className", () => {
    const alias = generateAlias("", new Map());
    expect(alias.length).toBeGreaterThan(0);
    expect(alias.trim()).toBe(alias);
  });
});

// An alias sits in grammar position on every arrow line and on the `participant X as Name`
// declaration, unquoted — unlike the (quotable) display name, a hostile character reaching it is a
// structural break, not just ugly text. `preferredAliases` used to hand the raw initials/prefix
// candidate straight to the caller: a class named `a->>b` produced the bare token `->`, `a:b`
// produced `A:`, and `a b` produced `A ` (a trailing space splitting the token). Cross-runtime
// finding, fixed to mirror the Java reference's `DiagramText.aliasToken` (letters/digits/`_` only,
// non-empty fallback) via `DiagramLabel.alias`.
describe("generateAlias — hostile class names", () => {
  // Unicode-aware "safe token" check: letters (any script), digits, and `_` only — no arrow
  // fragment, colon, space, quote or `@` can pass this, mirroring the runtime's own charset.
  const SAFE_ALIAS = /^[\p{L}\p{N}_]+$/u;

  test("an arrow fragment does not become a bare arrow token", () => {
    expect(generateAlias("a->>b", new Map())).toMatch(SAFE_ALIAS);
  });

  test("a colon does not survive into the alias", () => {
    expect(generateAlias("a:b", new Map())).toMatch(SAFE_ALIAS);
  });

  test("a space does not split the alias into two tokens", () => {
    const alias = generateAlias("a b", new Map());
    expect(alias).toMatch(SAFE_ALIAS);
    expect(alias).not.toContain(" ");
  });

  test("a quote does not survive into the alias", () => {
    expect(generateAlias('a"b', new Map())).toMatch(SAFE_ALIAS);
  });

  test("an @ does not survive into the alias", () => {
    expect(generateAlias("a@b", new Map())).toMatch(SAFE_ALIAS);
  });

  test("an empty class name still yields a non-empty, grammar-safe alias", () => {
    const alias = generateAlias("", new Map());
    expect(alias.length).toBeGreaterThan(0);
    expect(alias).toMatch(SAFE_ALIAS);
  });

  test("a non-ASCII class name keeps its letters rather than collapsing to the fallback", () => {
    // Unicode-aware, like Java's Character.isLetterOrDigit: a real letter survives even though it
    // is not in [A-Za-z] — the charset restriction targets grammar-breaking punctuation, not script.
    expect(generateAlias("日本語", new Map())).toBe("日本");
  });

  test("two class names that sanitize to the same alias token still get distinct aliases", () => {
    // `A:x` and `A;x` produce different raw candidates ("A:" / "A;") but the same sanitized token
    // ("A") — collision detection must run on the sanitized form, or both would have silently been
    // handed the literal, still-unsafe candidate under the old code.
    const existing = new Map<string, string>();
    const first = generateAlias("A:x", existing);
    existing.set("A:x", first);
    const second = generateAlias("A;x", existing);

    expect(first).toMatch(SAFE_ALIAS);
    expect(second).toMatch(SAFE_ALIAS);
    expect(first).not.toBe(second);
  });

  // Mermaid's own reserved words (`end`, `participant`, ...) as a bare alias are a known
  // limitation shared by the Java reference, whose fallback is the *entire* raw name run through
  // the same charset filter — a class literally named `end` or `participant` (no uppercase to
  // abbreviate) keeps that full word as its alias there. This runtime's `preferredAliases` never
  // reaches that gap: every candidate is capped to a 2-character initials/prefix abbreviation
  // before sanitization, so a lowercase reserved word (3+ characters) can never survive intact —
  // `end` and `participant` alias to `EN`/`PA`, not to themselves. Documented here as a verified
  // difference, not silently assumed.
  test("a Mermaid reserved word does not survive as the bare alias (this runtime's 2-char abbreviation sidesteps the shared Java/Python gap)", () => {
    expect(generateAlias("end", new Map())).toBe("EN");
    expect(generateAlias("participant", new Map())).toBe("PA");
  });

  // 2026-09-13 cross-runtime finding: a class named a Mermaid sequence-diagram reserved word
  // became that word verbatim as its alias in Java/Python — fixed there with a trailing `_`
  // suffix. This runtime's own `preferredAliases` (`alias-generator.ts`) never reaches that gap,
  // for a structural reason: every candidate is capped to a 2-character initials/prefix
  // abbreviation BEFORE sanitization (`initials.slice(0, 2)` / `className.slice(0, 2)`), so no
  // candidate can ever be 3 characters or longer — and every reserved word in both grammars this
  // runtime renders (Mermaid's `sequenceDiagram.jison` keywords, PlantUML's own sequence-diagram
  // keywords) is itself 3+ characters. The two facts together are the proof, not an assumption:
  // this test pins BOTH halves independently, so a future change shortening a candidate cap or a
  // newly-added 1-2 character reserved word in either grammar would fail it loudly, exactly where
  // the Java/Python `_`-suffix fix would otherwise need to be mirrored here too.
  describe("no reserved word (either grammar) can ever survive as a bare alias — proved, not assumed", () => {
    // Independently sourced (never imported from production code or from the security-tests
    // corpus test's own copy) — see that test's own module doc for each list's citation.
    const MERMAID_RESERVED = [
      "sequencediagram",
      "participant",
      "actor",
      "create",
      "destroy",
      "box",
      "loop",
      "rect",
      "opt",
      "alt",
      "else",
      "par",
      "par_over",
      "and",
      "critical",
      "option",
      "break",
      "end",
      "links",
      "link",
      "properties",
      "details",
      "over",
      "note",
      "activate",
      "deactivate",
      "autonumber",
      "off",
      "title",
    ];
    const PLANTUML_RESERVED = [
      "participant",
      "actor",
      "boundary",
      "control",
      "entity",
      "database",
      "collections",
      "queue",
      "end",
      "note",
      "alt",
      "else",
      "loop",
      "group",
      "opt",
      "par",
      "break",
      "critical",
      "ref",
      "activate",
      "deactivate",
      "destroy",
      "create",
      "return",
      "box",
      "title",
      "hide",
      "show",
      "skinparam",
      "autonumber",
    ];
    const ALL_RESERVED = [...new Set([...MERMAID_RESERVED, ...PLANTUML_RESERVED])];

    test("every reserved word, in either grammar, is at least 3 characters long", () => {
      for (const word of ALL_RESERVED) expect(word.length).toBeGreaterThanOrEqual(3);
    });

    test.each(
      ALL_RESERVED,
    )("a class literally named the reserved word %s does not alias to itself", (word) => {
      const alias = generateAlias(word, new Map());
      expect(alias.length).toBeLessThanOrEqual(2);
      expect(alias.toLowerCase()).not.toBe(word.toLowerCase());
    });

    test.each(
      ALL_RESERVED,
    )("the all-uppercase spelling of reserved word %s does not alias to itself either", (word) => {
      const alias = generateAlias(word.toUpperCase(), new Map());
      expect(alias.length).toBeLessThanOrEqual(2);
      expect(alias.toLowerCase()).not.toBe(word.toLowerCase());
    });
  });
});
