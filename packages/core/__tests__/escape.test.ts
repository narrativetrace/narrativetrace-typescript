// SPDX-License-Identifier: BUSL-1.1
// Licensed under the Business Source License 1.1 (see LICENSE); Change Date: four years from publication; Change License: Apache-2.0
// Copyright (c) 2026 Empower Agile
import { describe, expect, test } from "vitest";
import { ControlEscape } from "../src/control-escape.js";
import { MarkdownEscape } from "../src/markdown-escape.js";

describe("ControlEscape.sanitize", () => {
  test("maps the common control chars to mnemonics", () => {
    expect(ControlEscape.sanitize("a\nb\rc\td\be\ff")).toBe("a\\nb\\rc\\td\\be\\ff");
  });

  test("maps other ISO control chars to \\uXXXX (lowercase, 4 hex)", () => {
    const input = String.fromCharCode(0x00, 0x1b, 0x7f);
    expect(ControlEscape.sanitize(input)).toBe("\\u0000\\u001b\\u007f");
  });

  test("leaves printable characters untouched", () => {
    expect(ControlEscape.sanitize("Hello, world! café")).toBe("Hello, world! café");
  });

  test("empty string stays empty", () => {
    expect(ControlEscape.sanitize("")).toBe("");
  });
});

describe("MarkdownEscape.text", () => {
  test("HTML-escapes &, <, >", () => {
    expect(MarkdownEscape.text("a & b < c > d")).toBe("a &amp; b &lt; c &gt; d");
  });

  test("escapes < in a script tag", () => {
    expect(MarkdownEscape.text("<script>alert(1)</script>")).toBe(
      "&lt;script&gt;alert(1)&lt;/script&gt;",
    );
  });

  test("leaves other characters untouched", () => {
    expect(MarkdownEscape.text("plain text")).toBe("plain text");
  });
});

describe("MarkdownEscape.code", () => {
  test("wraps content with no backticks in single backticks", () => {
    expect(MarkdownEscape.code("value")).toBe("`value`");
  });

  test("widens the fence to longest-run + 1 and pads with spaces", () => {
    expect(MarkdownEscape.code("a`b")).toBe("`` a`b ``");
    expect(MarkdownEscape.code("a``b`c")).toBe("``` a``b`c ```");
  });
});
