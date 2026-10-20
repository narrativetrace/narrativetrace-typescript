// SPDX-License-Identifier: BUSL-1.1
// Licensed under the Business Source License 1.1 (see LICENSE); Change Date: four years from publication; Change License: Apache-2.0
// Copyright (c) 2026 Empower Agile
import { describe, expect, it } from "vitest";
import { promptKind, taskPrompt } from "../case-prompt.js";

/**
 * B-88: the one rule that classifies every `prompt.md` — a `# Case:` document sends its quoted task
 * alone, anything else is the prompt itself — and the strictness that refuses a document whose
 * task cannot be found rather than sending the whole file.
 */
const document = (task: string) =>
  `# Case: c\n\n**Task prompt** (given to the agent):\n\n${task}\n\n**Grading:** graders/verify.sh\n`;

describe("promptKind — case document vs bare prompt", () => {
  it("is a case document only when the file STARTS with the case header", () => {
    expect(promptKind("# Case: happy-path\n")).toBe("case-document");
    expect(promptKind("Set up NarrativeTrace.\n# Case: quoted later\n")).toBe("bare-prompt");
    expect(promptKind(" # Case: indented\n")).toBe("bare-prompt");
    expect(promptKind("# Cases: near miss\n")).toBe("bare-prompt");
    expect(promptKind("")).toBe("bare-prompt");
  });
});

describe("taskPrompt", () => {
  it("returns a bare prompt byte for byte, its hard wraps and trailing newline kept", () => {
    const bare = "Set up NarrativeTrace\nin this project.\n";
    expect(taskPrompt("p.md", bare)).toBe(bare);
  });

  it("unwraps the quoted task of a case document into one paragraph", () => {
    expect(taskPrompt("p.md", document("> one\n> two"))).toBe("one two");
  });

  it("keeps an empty quote line as a paragraph break", () => {
    expect(taskPrompt("p.md", document("> one\n>\n> two"))).toBe("one\n\ntwo");
  });

  it("accepts the colon-inside-the-bold spelling of the task line", () => {
    const text = "# Case: c\n\n**Task prompt:**\n\n> check redaction\n\n**Grading:** x\n";
    expect(taskPrompt("p.md", text)).toBe("check redaction");
  });

  it("stops at the first line that is not a quote", () => {
    expect(taskPrompt("p.md", document("> one\nnot quoted\n> later"))).toBe("one");
  });

  it("refuses a case document with no task line, naming the file", () => {
    expect(() => taskPrompt("/c/prompt.md", "# Case: c\n\n> orphan quote\n")).toThrow(
      /\/c\/prompt\.md.*Task prompt/,
    );
  });

  it("refuses a task line with prose instead of a quote under it", () => {
    expect(() => taskPrompt("p.md", document("Expected trajectory: x"))).toThrow(/Task prompt/);
  });

  it("refuses a quote that holds nothing but empty lines", () => {
    expect(() => taskPrompt("p.md", document(">\n>   "))).toThrow(/Task prompt/);
  });

  it("refuses a task line at the very end of the file", () => {
    expect(() => taskPrompt("p.md", "# Case: c\n\n**Task prompt**")).toThrow(/Task prompt/);
  });
});
