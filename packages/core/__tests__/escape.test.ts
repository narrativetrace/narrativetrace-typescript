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

describe("ControlEscape — the Unicode line and paragraph separators", () => {
  // Not ISO controls, but line terminators to JavaScript, java.util.regex and many log viewers,
  // so a raw one forges a line exactly as \n does (nightly fuzz finding in the Java reference).
  test("U+2028 renders as an escape, never raw", () => {
    expect(ControlEscape.sanitize("a b")).toBe("a\\u2028b");
  });

  test("U+2029 renders as an escape, never raw", () => {
    expect(ControlEscape.sanitize("a b")).toBe("a\\u2029b");
  });

  test("their neighbours are ordinary text", () => {
    expect(ControlEscape.sanitize("‧‪")).toBe("‧‪");
  });
});

describe("MarkdownEscape.cell", () => {
  test("escapes pipes so a value cannot split a table row", () => {
    expect(MarkdownEscape.cell("a|b")).toBe("a\\|b");
  });

  test.each(["\r\n", "\n", "\r"])("collapses the line break %j to one space", (lineBreak) => {
    expect(MarkdownEscape.cell(`a${lineBreak}| b`)).toBe("a \\| b");
  });

  test("leaves a plain value untouched", () => {
    expect(MarkdownEscape.cell("plain text")).toBe("plain text");
  });
});

describe("MarkdownEscape.collapseLineBreaks", () => {
  test("collapses every line-break form to a space and keeps pipes", () => {
    expect(MarkdownEscape.collapseLineBreaks("a\r\nb\nc\rd|e")).toBe("a b c d|e");
  });
});

describe("MarkdownEscape.codeSpanCell", () => {
  test("wraps a cell-escaped value in a code span", () => {
    expect(MarkdownEscape.codeSpanCell("A.b\n|c")).toBe("`A.b \\|c`");
  });

  test("widens the fence when the value carries a backtick", () => {
    expect(MarkdownEscape.codeSpanCell("a`b")).toBe("`` a`b ``");
  });
});

describe("MarkdownEscape.prose", () => {
  test.each([
    ["a heading run, one backslash per character", "## Title", "\\#\\# Title"],
    ["a backtick fence", "```ts", "\\```ts"],
    ["a tilde fence", "~~~", "\\~~~"],
    ["a dash list marker", "- item", "\\- item"],
    ["a numbered list marker", "1. item", "1\\. item"],
    ["a table pipe", "| a | b |", "\\| a | b |"],
    ["an indented heading", "  # Title", "  \\# Title"],
    ["a setext underline", "---", "\\---"],
  ])("neutralises %s at the start of a line", (_name, input, expected) => {
    expect(MarkdownEscape.prose(input)).toBe(expected);
  });

  test.each([
    ["ordinary text", "Charging, invoicing."],
    ["a mid-line hash", "issue #12 and a - b"],
    ["a hyphenated word at the line start", "-ish wording"],
  ])("leaves %s untouched", (_name, input) => {
    expect(MarkdownEscape.prose(input)).toBe(input);
  });

  test("escapes each line of a multi-line value and keeps the line breaks", () => {
    expect(MarkdownEscape.prose("a\r\n# b\n```")).toBe("a\r\n\\# b\n\\```");
  });
});

describe("MarkdownEscape.inlineCode", () => {
  test("wraps plain text in one backtick pair", () => {
    expect(MarkdownEscape.inlineCode("packages/billing")).toBe("`packages/billing`");
  });

  test("percent-encodes embedded backticks so the span keeps exactly two", () => {
    expect(MarkdownEscape.inlineCode("a`b``c")).toBe("`a%60b%60%60c`");
  });
});
