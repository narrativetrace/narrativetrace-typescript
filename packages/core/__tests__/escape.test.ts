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

/**
 * Splits a Markdown table row the way a GFM reader does: a backslash followed by ASCII
 * punctuation is one escaped character and is never a delimiter; every other `|` ends a cell.
 * This is the consumer's own rule, not this escaper's — a cell escape is only correct if it
 * survives it.
 */
function gfmCells(row: string): string[] {
  const cells: string[] = [];
  let cell = "";
  for (let i = 0; i < row.length; i++) {
    const ch = row[i] as string;
    const next = row[i + 1];
    if (ch === "\\" && next !== undefined && /[!-/:-@[-`{-~]/.test(next)) {
      cell += ch + next;
      i++;
    } else if (ch === "|") {
      cells.push(cell);
      cell = "";
    } else {
      cell += ch;
    }
  }
  cells.push(cell);
  return cells;
}

describe("MarkdownEscape.cell", () => {
  test("escapes pipes so a value cannot split a table row", () => {
    expect(MarkdownEscape.cell("a|b")).toBe("a\\|b");
  });

  // ADV-2026-10-30-1 — INVARIANT: an escaped value contributes exactly one column to its row,
  // whatever bytes it carries. `cell` escapes `|` without first escaping `\`, so a value holding
  // the two characters `\|` becomes `\\|`: an escaped backslash followed by a live pipe.
  test("ADV-2026-10-30-1: a value carrying a backslash before a pipe cannot add a column", () => {
    const hostile = `| ${MarkdownEscape.cell("a\\|b")} | second |`;
    const benign = `| ${MarkdownEscape.cell("ab")} | second |`;

    expect(gfmCells(hostile)).toHaveLength(gfmCells(benign).length);
  });

  test.each(["\r\n", "\n", "\r"])("collapses the line break %j to one space", (lineBreak) => {
    expect(MarkdownEscape.cell(`a${lineBreak}| b`)).toBe("a \\| b");
  });

  test("leaves a plain value untouched", () => {
    expect(MarkdownEscape.cell("plain text")).toBe("plain text");
  });

  // A value that is nothing but line breaks still has to occupy exactly one cell: each break
  // becomes one space, and \r\n stays one break rather than collapsing to two spaces.
  test("collapses a value made only of line breaks to one space per break", () => {
    expect(MarkdownEscape.cell("\r\n\n\r")).toBe("   ");
  });
});

describe("MarkdownEscape.collapseLineBreaks", () => {
  test("collapses every line-break form to a space and keeps pipes", () => {
    expect(MarkdownEscape.collapseLineBreaks("a\r\nb\nc\rd|e")).toBe("a b c d|e");
  });
});

describe("MarkdownEscape.codeSpanCell", () => {
  test("wraps a cell-escaped value in a code span", () => {
    expect(MarkdownEscape.codeSpanCell("A.b\n|c")).toBe("`A.b %7Cc`");
  });

  test("percent-encodes a backtick so the span never needs a wider fence", () => {
    expect(MarkdownEscape.codeSpanCell("a`b")).toBe("`a%60b`");
  });

  test("keeps a backslash single and encodes the pipe after it", () => {
    expect(MarkdownEscape.codeSpanCell("a\\|b")).toBe("`a\\%7Cb`");
  });
});

describe("MarkdownEscape.prose", () => {
  test("escapes a leading blockquote marker", () => {
    expect(MarkdownEscape.prose("> injected")).toBe("\\> injected");
  });

  test.each(["a > b", "**bold** word", "_em_ word"])("leaves %j unchanged", (value) => {
    expect(MarkdownEscape.prose(value)).toBe(value);
  });

  test("escapes a spaced underscore break", () => {
    expect(MarkdownEscape.prose("_ _ _")).toMatch(/^\\/);
  });

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
    ["an indented heading run", "  ## h", "  \\#\\# h"],
    ["an indented fence", "   ```", "   \\```"],
    ["an indented blockquote", " > q", " \\> q"],
    ["an indented list marker", "  - a", "  \\- a"],
    ["an indented table pipe", "  | a", "  \\| a"],
    ["an indented thematic break", "  ***", "  \\***"],
    ["a dash-only line", "--", "\\--"],
    ["a single equals line", "=", "\\="],
    ["an equals line with trailing spaces", "===  ", "\\===  "],
    ["an equals underline after text", "x\n===", "x\n\\==="],
  ])("neutralises %s", (_name, input, expected) => {
    expect(MarkdownEscape.prose(input)).toBe(expected);
  });

  test.each([
    ["a heading run", "    ## h"],
    ["a fence", "    ```"],
    ["a dash line", "    ---"],
    ["a list marker", "     - a"],
  ])("leaves %s indented four spaces or more untouched", (_name, input) => {
    expect(MarkdownEscape.prose(input)).toBe(input);
  });

  test.each(["a - b", "x == y", "snake_case_name"])("leaves %j unchanged", (value) => {
    expect(MarkdownEscape.prose(value)).toBe(value);
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

  // ADV-2026-10-30-3 — INVARIANT: an escaped value starts no block of its own, so the section
  // embedding it keeps the shape its renderer gave it. `prose` neutralises the `-`/`=` run that
  // underlines a heading, but a thematic break is `***` and `___` as well as `---`, and neither
  // reaches a branch of LINE_START_HAZARD: `[-*+](?:[ \t]|$)` wants a space after the marker and
  // `(?:-+|=+)[ \t]*$` never sees `*` or `_`. A value is then free to cut its own section in two.
  // `[-*+](?:[ \t]|$)` accepts end-of-line as well as a space after the marker, and a bare marker
  // alone on its line is a real (empty) list item to CommonMark. The `$` half of that alternation
  // is reached by nothing else in this file.
  test.each(["-", "*", "+"])("neutralises the bare list marker %j alone on its line", (marker) => {
    expect(MarkdownEscape.prose(marker)).toBe(`\\${marker}`);
  });

  test.each([
    ["an empty value", ""],
    ["a line of nothing but indent", "   "],
  ])("leaves %s byte-identical", (_name, input) => {
    expect(MarkdownEscape.prose(input)).toBe(input);
  });

  test.each([
    ["an asterisk thematic break", "***"],
    ["an underscore thematic break", "___"],
    ["a long asterisk thematic break", "*****"],
  ])("ADV-2026-10-30-3: neutralises %s at the start of a line", (_name, input) => {
    expect(MarkdownEscape.prose(input)).not.toBe(input);
  });
});

describe("MarkdownEscape.inlineCode", () => {
  test("wraps plain text in one backtick pair", () => {
    expect(MarkdownEscape.inlineCode("packages/billing")).toBe("`packages/billing`");
  });

  test("percent-encodes embedded backticks so the span keeps exactly two", () => {
    expect(MarkdownEscape.inlineCode("a`b``c")).toBe("`a%60b%60%60c`");
  });

  // The worst case for the percent-encoding: a value that is nothing but backticks. The span still
  // ends up with exactly the two it wraps, so it cannot pair with a run elsewhere in the line.
  test("a value of nothing but backticks leaves exactly the wrapping pair", () => {
    const span = MarkdownEscape.inlineCode("````");

    expect(span).toBe("`%60%60%60%60`");
    expect(span.match(/`/g)).toHaveLength(2);
  });
});
