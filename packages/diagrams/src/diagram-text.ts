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
 */
export const DiagramText = {
  message(text: string): string {
    let out = "";
    for (const ch of text) {
      const code = ch.codePointAt(0) ?? 0;
      out += isIsoControl(code) ? " " : ch;
    }
    return out;
  },

  /**
   * Sanitizes a structural name (a participant display name, or text an alias token is derived
   * from) for both Mermaid and PlantUML at once: folds controls like {@link message}, turns `"`
   * into `'` (neither grammar can escape a quote *inside* a quoted name — the character must stop
   * being a quote), collapses Mermaid's `%%` comment opener, caps length, and maps an
   * empty-or-all-control name to `<unnamed>` rather than emitting a bare, malformed statement.
   * Port of Java `DiagramText.identifier` (cross-runtime shape F4, 2026-09-02 audit).
   */
  identifier(text: string): string {
    const folded = DiagramText.message(text).replace(/"/g, "'").replace(/%%/g, "% %");
    const capped =
      folded.length > MAX_IDENTIFIER_LENGTH ? folded.slice(0, MAX_IDENTIFIER_LENGTH) : folded;
    return capped.trim().length > 0 ? capped : "<unnamed>";
  },
};
