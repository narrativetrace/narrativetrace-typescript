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
