// SPDX-License-Identifier: BUSL-1.1
// Licensed under the Business Source License 1.1 (see LICENSE); Change Date: four years from publication; Change License: Apache-2.0
// Copyright (c) 2026 Empower Agile
const MNEMONICS: Record<number, string> = {
  10: "\\n",
  13: "\\r",
  9: "\\t",
  8: "\\b",
  12: "\\f",
};

// ISO control: C0 (0x00-0x1F) and C1 (0x7F-0x9F).
function isIsoControl(code: number): boolean {
  return code <= 0x1f || (code >= 0x7f && code <= 0x9f);
}

/**
 * U+2028 and U+2029: not ISO controls, but line terminators to JavaScript, `java.util.regex` and
 * many log viewers, so a raw one forges a line exactly as `\n` does.
 */
function isLineSeparator(code: number): boolean {
  return code === 0x2028 || code === 0x2029;
}

/**
 * Folds control characters into printable escapes so trace values/messages cannot inject
 * newlines or terminal directives (anti log-forging / output-injection). Common controls use
 * mnemonics (`\n \r \t \b \f`); any other ISO-control char, and the Unicode line and paragraph
 * separators U+2028/U+2029, becomes `\uXXXX`. Port of Java
 * `render/ControlEscape`.
 */
export const ControlEscape = {
  sanitize(text: string): string {
    let out = "";
    for (const ch of text) {
      const code = ch.codePointAt(0) ?? 0;
      const mnemonic = MNEMONICS[code];
      if (mnemonic !== undefined) {
        out += mnemonic;
      } else if (isIsoControl(code) || isLineSeparator(code)) {
        out += `\\u${code.toString(16).padStart(4, "0")}`;
      } else {
        out += ch;
      }
    }
    return out;
  },
};
