// SPDX-License-Identifier: BUSL-1.1
// Licensed under the Business Source License 1.1 (see LICENSE); Change Date: four years from publication; Change License: Apache-2.0
// Copyright (c) 2026 Empower Agile
/**
 * Source text with its JavaScript/TypeScript comments removed, string and template literals kept
 * intact, and every line break kept — so evidence the doctor finds in it is code, never a
 * commented-out line that would wire the framework if anybody uncommented it.
 *
 * @llmNote A scanner, not a pattern: "a `//` that is not inside a string" needs to know where every
 * string starts and ends, which no single regular expression over arbitrary project text does
 * without the nested quantifiers a ReDoS review rejects. Known limit: a regular-expression literal
 * holding an unescaped `//` or `/*` is read as a comment — rare in the wiring files this reads; a
 * stray quote costs at most the rest of its own line (see {@link literal}).
 */
export function withoutComments(source: string): string {
  let out = "";
  let position = 0;
  while (position < source.length) {
    const next = scanToken(source, position);
    out += next.kept;
    position = next.end;
  }
  return out;
}

interface Token {
  readonly kept: string;
  readonly end: number;
}

const QUOTES = new Set(['"', "'", "`"]);

/** The token starting at `start`: a comment (kept as its line breaks), a literal, or one character. */
function scanToken(source: string, start: number): Token {
  const pair = source.slice(start, start + 2);
  if (pair === "//") return lineComment(source, start);
  if (pair === "/*") return blockComment(source, start);
  if (QUOTES.has(source[start] as string)) return literal(source, start);
  return { kept: source[start] as string, end: start + 1 };
}

function lineComment(source: string, start: number): Token {
  const newline = source.indexOf("\n", start);
  return { kept: "", end: newline < 0 ? source.length : newline };
}

function blockComment(source: string, start: number): Token {
  const close = source.indexOf("*/", start + 2);
  const end = close < 0 ? source.length : close + 2;
  return { kept: source.slice(start, end).replace(/[^\n]/g, ""), end };
}

/**
 * A quoted literal up to its unescaped closing quote, kept verbatim. A `'` or `"` literal also
 * ends at a line break, as JavaScript's own do — so an apostrophe that is not a string at all (JSX
 * text, `<p>Don't</p>`; a quote inside a regular-expression literal) swallows the rest of its line
 * at most, never the commented-out lines after it. A template literal may span lines.
 */
function literal(source: string, start: number): Token {
  const quote = source[start];
  let cursor = start + 1;
  while (
    cursor < source.length &&
    source[cursor] !== quote &&
    !endsSingleLine(quote, source[cursor])
  ) {
    cursor += source[cursor] === "\\" ? 2 : 1;
  }
  const closed = cursor < source.length && source[cursor] === quote;
  const end = Math.min(closed ? cursor + 1 : cursor, source.length);
  return { kept: source.slice(start, end), end };
}

function endsSingleLine(quote: string | undefined, character: string | undefined): boolean {
  return quote !== "`" && character === "\n";
}
