// SPDX-License-Identifier: BUSL-1.1
// Licensed under the Business Source License 1.1 (see LICENSE); Change Date: four years from publication; Change License: Apache-2.0
// Copyright (c) 2026 Empower Agile
import { readdirSync, readFileSync } from "node:fs";
import { join, relative } from "node:path";
import { describe, expect, it } from "vitest";
import { REPO_ROOT, REPO_ROOT_REACHABLE } from "./repo-root.js";

/**
 * Docs-as-tests applied to the init prompt: a prompt we publish is a prompt we replay, so the
 * published text and the replayed text may never drift apart. The prompt lives in eleven places —
 * the English README and its three language mirrors (the prompt itself stays in English on
 * purpose; only the sentence introducing it is translated), `documentation/llms.txt`, the five
 * Tier B cases whose `prompt.md` IS the prompt and nothing else, and the last positive phrasing in
 * `add-narrative-tracing`'s trigger set. This test is what makes eleven copies safe: they are
 * byte-identical or `check` fails.
 *
 * @llmNote The case copies are DISCOVERED, not listed: every `prompt.md` under `evals/` opening
 * with the prompt's first line is a copy of it, so a new case that pastes the prompt is compared
 * whether or not anybody remembered to add it here. A listed-only comparison cannot see a copy
 * nobody listed — which is exactly what a new case is. The five paths expected today are asserted
 * to be AMONG what discovery finds, so a case that silently disappears still fails.
 *
 * @llmNote Editing the prompt means editing all eleven. The mirrors' blob-hash headers are a
 * separate concern (`translation-check`); this test only compares the prompt block.
 */

const PAGES_WITH_A_FENCED_BLOCK = [
  "README.md",
  "LEAME.md",
  "LEIAME.md",
  "自述文件.md",
  "documentation/llms.txt",
] as const;

const EVALS_DIR = "packages/skills-catalogue/evals";

const CASES_WHOSE_PROMPT_IS_THE_WHOLE_FILE = [
  `${EVALS_DIR}/add-narrative-tracing/init-prompt-empty-project/prompt.md`,
  `${EVALS_DIR}/add-narrative-tracing/init-prompt-existing-project/prompt.md`,
  `${EVALS_DIR}/add-narrative-tracing/init-prompt-express-project/prompt.md`,
  `${EVALS_DIR}/add-narrative-tracing/registry-claude-marketplace/prompt.md`,
  `${EVALS_DIR}/add-narrative-tracing/registry-npx-skills/prompt.md`,
] as const;

/** Every `prompt.md` under `evals/`, repo-root-relative with `/` separators, in a stable order. */
function everyCasePrompt(): readonly string[] {
  const found: string[] = [];
  for (const entry of readdirSync(join(REPO_ROOT, EVALS_DIR), {
    recursive: true,
    withFileTypes: true,
  })) {
    if (!entry.isFile() || entry.name !== "prompt.md") continue;
    found.push(relative(REPO_ROOT, join(entry.parentPath, entry.name)).split("\\").join("/"));
  }
  return found.sort();
}

/** Those of them that ARE the published prompt — the ones whose first line is its first line. */
function casePromptsThatArePublished(): readonly string[] {
  return everyCasePrompt().filter((path) =>
    readFileSync(join(REPO_ROOT, path), "utf-8").startsWith(FIRST_LINE),
  );
}

const TRIGGER_YAML = "packages/skills-catalogue/evals/add-narrative-tracing/trigger.yaml";

const FIRST_LINE = "Set up NarrativeTrace in this project and show me its first trace.";

/** The one fenced block on `page` that opens with the prompt's first line, without its fences. */
function fencedInitPrompt(page: string): string {
  const lines = readFileSync(join(REPO_ROOT, page), "utf-8").split("\n");
  for (let i = 0; i < lines.length - 1; i++) {
    if ((lines[i] as string).startsWith("```") && (lines[i + 1] as string).startsWith(FIRST_LINE)) {
      const body: string[] = [];
      for (let j = i + 1; j < lines.length && lines[j] !== "```"; j++)
        body.push(lines[j] as string);
      return body.join("\n").trim();
    }
  }
  throw new Error(`${page} carries no fenced init-prompt block`);
}

/**
 * The positive trigger phrasing that IS the prompt — the published text as a trigger case, written
 * as a YAML block scalar (`- |`) so its hard wraps survive verbatim. Read by de-indenting that
 * block rather than by parsing YAML: this package declares no YAML parser, and an undeclared
 * dependency resolved by hoisting is a dependency that disappears the first time the store layout
 * changes.
 */
function triggerPhrasing(): string {
  const lines = readFileSync(join(REPO_ROOT, TRIGGER_YAML), "utf-8").split("\n");
  const start = lines.findIndex((line) => line.trimStart().startsWith(FIRST_LINE));
  if (start === -1) throw new Error(`${TRIGGER_YAML} carries no phrasing that is the prompt`);
  const indent = (lines[start] as string).length - (lines[start] as string).trimStart().length;
  const body: string[] = [];
  for (let i = start; i < lines.length; i++) {
    const line = lines[i] as string;
    if (line.trim() !== "" && line.slice(0, indent).trim() !== "") break;
    body.push(line.slice(indent));
  }
  return body.join("\n").trim();
}

describe.skipIf(!REPO_ROOT_REACHABLE)("the published init prompt", () => {
  it("is byte-identical in every copy, including a case copy nobody listed", () => {
    const discovered = casePromptsThatArePublished();
    const copies = [
      ...PAGES_WITH_A_FENCED_BLOCK.map(fencedInitPrompt),
      ...discovered.map((path) => readFileSync(join(REPO_ROOT, path), "utf-8").trim()),
      triggerPhrasing(),
    ];

    expect(copies).toHaveLength(discovered.length + 6);
    for (const copy of copies) expect(copy).toBe(copies[0]);
  });

  it("is replayed by the five cases that are expected to carry it", () => {
    expect(casePromptsThatArePublished()).toEqual(
      expect.arrayContaining([...CASES_WHOSE_PROMPT_IS_THE_WHOLE_FILE]),
    );
  });

  it("is not accidentally the whole of some OTHER case's prompt", () => {
    expect(casePromptsThatArePublished()).toHaveLength(CASES_WHOSE_PROMPT_IS_THE_WHOLE_FILE.length);
  });

  it("is the prompt an agent is actually told to paste", () => {
    const published = fencedInitPrompt("README.md");

    expect(published).toContain("https://narrativetrace.ai/typescript/llms.txt");
    expect(published).toContain("npx @narrativetrace/cli doctor");
    expect(published).toContain("never disable redaction");
  });

  it("names no version — it tells the agent not to guess one instead", () => {
    const published = fencedInitPrompt("README.md");

    expect(published).not.toMatch(/\d+\.\d+\.\d+/);
    expect(published).toContain("Do not guess versions or artifact names");
  });
});
