// SPDX-License-Identifier: BUSL-1.1
// Licensed under the Business Source License 1.1 (see LICENSE); Change Date: four years from publication; Change License: Apache-2.0
// Copyright (c) 2026 Empower Agile
function longestBacktickRun(s: string): number {
  let max = 0;
  let run = 0;
  for (const ch of s) {
    if (ch === "`") {
      run++;
      if (run > max) max = run;
    } else {
      run = 0;
    }
  }
  return max;
}

/**
 * A line start Markdown reads as structure (indented by at most three spaces; four or more is an
 * indented code block and stays text): a heading run, a numbered item, or a fence, list
 * marker, setext underline, table pipe, blockquote marker or `*` / `_` thematic break.
 */
const LINE_START_HAZARD =
  /^( {0,3})(?:(#+)|(\d+)(?=[.)](?:[ \t]|$))|(?=```|~~~|[-*+](?:[ \t]|$)|(?:-+|=+)[ \t]*$|\||>|([*_])(?:[ \t]*\4){2,}[ \t]*$))/gm;

/**
 * Escaping for embedding untrusted values into Markdown. `text` HTML-escapes `& < >` so a
 * value cannot inject raw HTML; `code` wraps content in a backtick fence widened to the
 * longest internal backtick run + 1 (space-padded) so a value containing backticks cannot
 * break out of its code span.
 *
 * `cell`, `codeSpanCell` and `collapseLineBreaks` are the one table-cell escape, kept on this
 * one object so every table renderer (glossary, clarity reports) shares one body: `cell` escapes
 * `|` and collapses `\r\n` / `\n` / `\r` to a space, so a value can neither add a column nor end
 * the row; `codeSpanCell` is the same for backtick-wrapped content; `collapseLineBreaks` is for
 * prose (headings, list items) where a pipe is harmless but a line break starts a new block.
 *
 * `prose` is for multi-line free text that keeps its line breaks (a bounded context's description):
 * it backslash-escapes whatever would start a heading, fence, list item, setext underline or table
 * row at the start of a line, so a value stays text inside the section that embeds it.
 * `inlineCode` wraps text in exactly one backtick pair, percent-encoding embedded backticks as
 * `%60` (the way `cell`'s `\|` keeps a pipe from ending a column) so the span cannot end early.
 */
export const MarkdownEscape = {
  text(text: string): string {
    return text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  },

  collapseLineBreaks(text: string): string {
    return text.replace(/\r\n|[\r\n]/g, " ");
  },

  prose(text: string): string {
    return text.replace(LINE_START_HAZARD, (_all, indent, hashes, digits) =>
      hashes ? indent + "\\#".repeat(hashes.length) : `${indent}${digits ?? ""}\\`,
    );
  },

  inlineCode(text: string): string {
    return `\`${text.replaceAll("`", "%60")}\``;
  },

  cell(text: string): string {
    return MarkdownEscape.collapseLineBreaks(text.replace(/[\\|]/g, "\\$&"));
  },

  codeSpanCell(content: string): string {
    const encoded = content.replace(/[|`]/g, (c) => (c === "|" ? "%7C" : "%60"));
    return MarkdownEscape.code(MarkdownEscape.collapseLineBreaks(encoded));
  },

  code(content: string): string {
    const maxRun = longestBacktickRun(content);
    if (maxRun === 0) return `\`${content}\``;
    const fence = "`".repeat(maxRun + 1);
    return `${fence} ${content} ${fence}`;
  },
};
