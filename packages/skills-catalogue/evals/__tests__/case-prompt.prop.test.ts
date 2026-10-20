// SPDX-License-Identifier: BUSL-1.1
// Licensed under the Business Source License 1.1 (see LICENSE); Change Date: four years from publication; Change License: Apache-2.0
// Copyright (c) 2026 Empower Agile
import fc from "fast-check";
import { describe, expect, it } from "vitest";
import { taskPrompt } from "../case-prompt.js";

/** One line of quoted words: no newline, no leading `>`, never blank. */
const quotedLine = fc
  .string({ minLength: 1, maxLength: 40 })
  .map((line) => line.replace(/[\r\n]/g, " ").trim())
  .filter((line) => line !== "" && !line.startsWith(">"));

describe("taskPrompt — properties", () => {
  it("sends exactly the quoted words and nothing that follows the quote", () => {
    fc.assert(
      fc.property(
        fc.array(quotedLine, { minLength: 1, maxLength: 6 }),
        fc.string(),
        (lines, tail) => {
          const text =
            `# Case: c\n\n**Task prompt**\n\n${lines.map((line) => `> ${line}`).join("\n")}` +
            `\n\n**Grading:** ${tail}`;
          expect(taskPrompt("p.md", text)).toBe(lines.join(" "));
        },
      ),
    );
  });

  it("never throws for a bare prompt and always returns it unchanged", () => {
    fc.assert(
      fc.property(
        fc.string().filter((text) => !text.startsWith("# Case:")),
        (text) => {
          expect(taskPrompt("p.md", text)).toBe(text);
        },
      ),
    );
  });
});
