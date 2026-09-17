// SPDX-License-Identifier: BUSL-1.1
// Licensed under the Business Source License 1.1 (see LICENSE); Change Date: four years from publication; Change License: Apache-2.0
// Copyright (c) 2026 Empower Agile
// ISO control: C0 (0x00-0x1F) and C1 (0x7F-0x9F).
function isIsoControl(code: number): boolean {
  return code <= 0x1f || (code >= 0x7f && code <= 0x9f);
}

const MAX_IDENTIFIER_LENGTH = 200;

/**
 * Folds every ISO control character (notably CR/LF) in interpolated diagram text to a single
 * space so a rendered value cannot inject a new diagram statement — e.g. a Mermaid `click` or
 * PlantUML `!include` directive (diagram-injection / SSRF / local-file read). Port of Java
 * `diagrams/DiagramText.message`.
 *
 * @remarks Private implementation — {@link DiagramLabel} (`diagram-label.ts`) is the only caller;
 * a raw trace string reaches a diagram line only through that type's factories.
 */
export function message(text: string): string {
  let out = "";
  for (const ch of text) {
    const code = ch.codePointAt(0) ?? 0;
    out += isIsoControl(code) ? " " : ch;
  }
  return out;
}

/**
 * Sanitizes a structural name (a participant display name, or text an alias token is derived
 * from) for both Mermaid and PlantUML at once: folds controls like {@link message}, turns `"`
 * into `'` (neither grammar can escape a quote *inside* a quoted name — the character must stop
 * being a quote), collapses Mermaid's `%%` comment opener, caps length, and maps an
 * empty-or-all-control name to `<unnamed>` rather than emitting a bare, malformed statement.
 * Port of Java `DiagramText.identifier` (cross-runtime shape F4, 2026-09-02 audit).
 *
 * @remarks Private implementation — see {@link message}'s own remark.
 */
export function identifier(text: string): string {
  const folded = message(text).replace(/"/g, "'").replace(/%%/g, "% %");
  const capped =
    folded.length > MAX_IDENTIFIER_LENGTH ? folded.slice(0, MAX_IDENTIFIER_LENGTH) : folded;
  return capped.trim().length > 0 ? capped : "<unnamed>";
}

// A letter or digit in the Unicode sense — Unicode general category L (letter) or N (number) — a
// non-ASCII letter survives; punctuation, symbols, whitespace and control characters do not.
const IS_LETTER_OR_DIGIT = /[\p{L}\p{N}]/u;

const UNNAMED_ALIAS = "P";

/**
 * A bare Mermaid/PlantUML participant alias: a single unquotable token, safe unquoted both on a
 * `participant X as Name` declaration and on every arrow line that names it. Port of Java
 * `DiagramText.aliasToken`.
 *
 * @remarks {@link identifier} is not enough here — an alias sits in grammar position, not text
 * position, and its output can still carry a space, a colon, an arrow fragment (`->>`) or a quote,
 * any one of which would split an arrow into the wrong number of tokens or splice a second
 * participant into the line. This reduces the candidate to letters, digits and `_` and falls back
 * to {@link UNNAMED_ALIAS} when nothing survives — never an empty token, which would emit a
 * malformed `participant ` declaration or collapse an arrow's endpoint entirely. A class name with
 * no uppercase letters and nothing hostile in it keeps its historical alias unchanged.
 *
 * @remarks Private implementation — {@link DiagramLabel.alias} (`diagram-label.ts`) is the only
 * caller. Collision detection must run on this function's *output*, not the raw candidate: two
 * distinct raw candidates that reduce to the same token (`A:` and `A;` both fold to `A`) are the
 * same participant unless the caller renumbers them apart.
 */
export function aliasToken(raw: string): string {
  let out = "";
  for (const ch of raw) {
    if (out.length >= MAX_IDENTIFIER_LENGTH) break;
    if (ch === "_" || IS_LETTER_OR_DIGIT.test(ch)) out += ch;
  }
  return out.length > 0 ? out : UNNAMED_ALIAS;
}
