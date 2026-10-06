// SPDX-License-Identifier: BUSL-1.1
// Licensed under the Business Source License 1.1 (see LICENSE); Change Date: four years from publication; Change License: Apache-2.0
// Copyright (c) 2026 Empower Agile
import { readFileSync } from "node:fs";
import { SKILLS } from "@narrativetrace/skills-catalogue";
import {
  applyMask,
  englishDocPages,
  parseSnippetBlocks,
  resolveSnippetSource,
  rootReadmePage,
} from "./snippet-shared.js";
import { check as checkVersionLiterals } from "./version-literals.js";

// Per-commit gate (wired into `pnpm run check`, after `pnpm run coverage`: the sixty-seconds
// example's one test has to have already run and written its output artifact for the page's
// output-block snippet to have anything to compare against). No network, no registry access — it
// only reads files already on disk, English pages only (mirrors are compared by
// `translation-check`, never touched here).
//
// Two checks, one gate, because they are two halves of the same rule — an embedded snippet and an
// install coordinate are both content a page carries that something else owns, and `snippet-sync`
// is the only writer of either. The version-literal half (version-literals.ts) does read the
// mirrors: a coordinate is language-neutral, so a stale one in a translated page is as wrong as a
// stale one in English.

interface Drift {
  readonly page: string;
  readonly markerLine: number;
  readonly path: string;
  readonly region: string | undefined;
}

const SKILL_PLATFORM_ROOTS = [".claude/skills", ".agents/skills"] as const;

/** Rendered SKILL.md pages carry the same `<!-- snippet: --> ` markers as docs (agent-skills-2026-09-12.md §3: "never a second hand-copied literal") — checked here, not a second implementation. Every platform's rendered directory is checked, not just Claude's. */
function skillPages(): string[] {
  return SKILLS.flatMap((skill) =>
    SKILL_PLATFORM_ROOTS.flatMap((root) => englishDocPages(`${root}/${skill.canonicalName}`)),
  );
}

function findSnippetDrifts(): Drift[] {
  const drifts: Drift[] = [];
  for (const page of [...englishDocPages(), ...rootReadmePage(), ...skillPages()]) {
    const text = readFileSync(page, "utf-8");
    for (const block of parseSnippetBlocks(page, text)) {
      const embedded = applyMask(block.contentLines.join("\n"), block.mask);
      const actual = applyMask(resolveSnippetSource(block), block.mask);
      if (embedded !== actual) {
        drifts.push({
          page: block.page,
          markerLine: block.markerLine,
          path: block.path,
          region: block.region,
        });
      }
    }
  }
  return drifts;
}

function reportSnippetDrifts(drifts: readonly Drift[]): void {
  const first = drifts[0] as Drift;
  console.error(
    `snippet-check failed: ${first.page}:${first.markerLine} no longer matches its source\n` +
      `  page:   ${first.page}\n` +
      `  source: ${first.path}${first.region ? ` (region=${first.region})` : ""}\n` +
      "  run `pnpm run snippet-sync` if the source is right, or fix the source if the page is right",
  );
  if (drifts.length > 1) {
    console.error(`\n${drifts.length - 1} more drifted block(s):`);
    for (const d of drifts.slice(1)) {
      console.error(
        `  ${d.page}:${d.markerLine} — ${d.path}${d.region ? ` (region=${d.region})` : ""}`,
      );
    }
  }
}

function repoVersion(): string {
  return (JSON.parse(readFileSync("packages/core/package.json", "utf-8")) as { version: string })
    .version;
}

const drifts = findSnippetDrifts();
if (drifts.length > 0) {
  reportSnippetDrifts(drifts);
  process.exit(1);
}

const versionTalk = checkVersionLiterals(process.cwd(), repoVersion());
if (versionTalk.length > 0) {
  console.error(`snippet-check failed: ${versionTalk.length} version-literal problem(s):`);
  for (const problem of versionTalk) console.error(`  ${problem}`);
  console.error("  a coordinate is fixed by `pnpm run snippet-sync`; everything else is prose");
  process.exit(1);
}

console.log("snippet-check: every embedded snippet matches its source, and no page talks versions");
