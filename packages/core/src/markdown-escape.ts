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
 * Escaping for embedding untrusted values into Markdown. `text` HTML-escapes `& < >` so a
 * value cannot inject raw HTML; `code` wraps content in a backtick fence widened to the
 * longest internal backtick run + 1 (space-padded) so a value containing backticks cannot
 * break out of its code span. Port of Java `render/MarkdownEscape`.
 */
export const MarkdownEscape = {
  text(text: string): string {
    return text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  },

  code(content: string): string {
    const maxRun = longestBacktickRun(content);
    if (maxRun === 0) return `\`${content}\``;
    const fence = "`".repeat(maxRun + 1);
    return `${fence} ${content} ${fence}`;
  },
};
