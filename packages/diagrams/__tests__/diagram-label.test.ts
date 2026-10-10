// SPDX-License-Identifier: BUSL-1.1
// Licensed under the Business Source License 1.1 (see LICENSE); Change Date: four years from publication; Change License: Apache-2.0
// Copyright (c) 2026 Empower Agile
import { describe, expect, test } from "vitest";
import { DiagramLabel } from "../src/diagram-label.js";

// `DiagramLabel.alias` (`diagram-text.ts`'s `aliasToken`) is the sanitizer both
// `alias-generator.test.ts`'s generator-level cases and the renderer-level "participant alias
// hostile class names" suites exercise indirectly, always through a 2-character candidate. This
// file tests the factory directly, the way `identifier`/`message` are documented but never
// unit-tested on their own — added here because this factory's non-empty-fallback and
// length-cap behavior (unlike `identifier`'s own cap, which every renderer test already reaches
// through a long display name) has no other route to coverage: every current caller
// (`alias-generator.ts`) hands it a candidate no longer than 2 raw characters.
describe("DiagramLabel.alias", () => {
  test("a plain identifier passes through unchanged", () => {
    expect(DiagramLabel.alias("Order")).toBe("Order");
  });

  test("strips every character that is not a letter, digit or underscore", () => {
    expect(DiagramLabel.alias('a->>b: c"d')).toBe("abcd");
  });

  test("keeps a non-ASCII letter rather than stripping it", () => {
    expect(DiagramLabel.alias("日本語")).toBe("日本語");
  });

  test("never returns an empty token", () => {
    expect(DiagramLabel.alias("")).toBe("P");
    expect(DiagramLabel.alias('->>:"')).toBe("P");
  });

  test("caps the token length so an unbounded candidate cannot make the diagram unreadable", () => {
    const longName = "a".repeat(250);
    const alias = DiagramLabel.alias(longName);
    expect(alias.length).toBe(200);
    expect(alias).toBe("a".repeat(200));
  });
});

describe("DiagramLabel.spanId — a derived position path, checked rather than sanitized", () => {
  test("accepts a well-formed span id unchanged", () => {
    expect(DiagramLabel.spanId("#1.3.2")).toBe("#1.3.2");
  });

  test.each(["", "#", "1.2", "#1.", "#1\nclick X", "#1 x"])("refuses %j", (id) => {
    expect(() => DiagramLabel.spanId(id)).toThrow(RangeError);
  });
});

// A line terminator for some consumer of the diagram — not only an ISO control. U+2028/U+2029 end
// a line for JavaScript (Mermaid's own runtime) and most viewers; mirrors the Java nightly finding
// of 2026-10-10.
describe("DiagramLabel line-terminator folding", () => {
  const terminators = [
    "\u2028",
    "\u2029",
    "\u0085",
    "\u0000",
    "\u001f",
    "\u007f",
    "\u009f",
    "\r",
    "\n",
  ];

  test.each(terminators)("a name folds %j to a space", (sep) => {
    expect(DiagramLabel.identifier(`A${sep}B`)).toBe("A B");
  });

  test.each(terminators)("a message folds %j to a space", (sep) => {
    expect(DiagramLabel.message(`A${sep}B`)).toBe("A B");
  });

  test("a name made only of separators is unnamed", () => {
    expect(DiagramLabel.identifier("\u2028\u2029\u0085")).toBe("<unnamed>");
  });

  test("near-miss neighbours of the separators are kept", () => {
    expect(DiagramLabel.message("\u2027\u202a")).toBe("\u2027\u202a");
  });
});
