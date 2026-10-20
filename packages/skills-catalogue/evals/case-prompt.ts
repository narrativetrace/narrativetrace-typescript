// SPDX-License-Identifier: BUSL-1.1
// Licensed under the Business Source License 1.1 (see LICENSE); Change Date: four years from publication; Change License: Apache-2.0
// Copyright (c) 2026 Empower Agile
/**
 * INTENT: what a trial's agent is told on its first turn, read out of the case's `prompt.md` — and
 * nothing the grader reads beside it (B-88, 2026-10-17: the runner sent the WHOLE file, so the
 * agent read the "Expected trajectory" and the gates it was graded on).
 *
 * One rule classifies every `prompt.md`: a file whose first line starts with `# Case:` is a CASE
 * DOCUMENT, and the agent is sent only the `>` blockquote under its `**Task prompt**` line; any
 * other file is a BARE PROMPT, and IS what the agent is sent, byte for byte (the init-prompt cases,
 * whose hard wraps are part of the text a reader pastes).
 *
 * @llmNote Strict by design: a case document without that blockquote is refused, never sent whole —
 * a silent fall-back to the file is exactly the leak this module exists to close.
 */

export type PromptKind = "case-document" | "bare-prompt";

const CASE_HEADER = "# Case:";
const TASK_LINE = "**Task prompt";

/** Which half of the rule `text` falls under. */
export function promptKind(text: string): PromptKind {
  return text.startsWith(CASE_HEADER) ? "case-document" : "bare-prompt";
}

/**
 * The words the agent is sent for the `prompt.md` at `path` whose content is `text`. A case
 * document's quote is unwrapped: its lines become one paragraph, an empty `>` line a paragraph
 * break, the way a person types the request rather than the way the file wraps it.
 *
 * @throws {Error} naming `path` when a case document has no `**Task prompt**` line, or no
 * non-empty blockquote directly under it.
 */
export function taskPrompt(path: string, text: string): string {
  if (promptKind(text) === "bare-prompt") return text;
  const quote = quotedTaskLines(text.split("\n"));
  const task = unwrap(quote);
  if (task === "") {
    throw new Error(`${path} is a case document with no quoted ${TASK_LINE}** blockquote`);
  }
  return task;
}

/** The `>` lines directly under the task line, blank lines between the two skipped. */
function quotedTaskLines(lines: readonly string[]): readonly string[] {
  const start = lines.findIndex((line) => line.startsWith(TASK_LINE));
  if (start === -1) return [];
  let at = start + 1;
  while (at < lines.length && lines[at]?.trim() === "") at++;
  const quote: string[] = [];
  for (; at < lines.length && lines[at]?.startsWith(">"); at++) {
    quote.push((lines[at] as string).replace(/^> ?/, ""));
  }
  return quote;
}

/** Wrapped lines joined by a space; an empty line ends a paragraph. */
function unwrap(lines: readonly string[]): string {
  const paragraphs: string[][] = [[]];
  for (const line of lines) {
    if (line.trim() === "") paragraphs.push([]);
    else paragraphs.at(-1)?.push(line.trim());
  }
  return paragraphs
    .map((words) => words.join(" "))
    .filter((paragraph) => paragraph !== "")
    .join("\n\n");
}
