// SPDX-License-Identifier: BUSL-1.1
// Licensed under the Business Source License 1.1 (see LICENSE); Change Date: four years from publication; Change License: Apache-2.0
// Copyright (c) 2026 Empower Agile
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { join, relative } from "node:path";
import { publicDocuments } from "./public-documents.js";
import { gitBlobHash12, parseHeader } from "./translation-check-discovery.js";

/**
 * "No version talk anywhere", mechanised — and it is about NARRATIVETRACE's versions (owner ruling
 * 2026-09-24, narrowed by the same owner 2026-09-25). Repository documentation is assumed to
 * describe the code it is committed with, so no README, guide or `llms.txt` says which version it
 * describes or which one is published. The ONE version literal a public document may carry for
 * THIS project is an **install coordinate** — a snippet that cannot be pasted is not a quickstart —
 * and that one is machine-written: {@link sync} substitutes `packages/core/package.json`'s version
 * into every coordinate form, {@link check} fails the gate on a coordinate pinned anywhere else.
 * `snippet-sync` is the only writer, `snippet-check` the reader, exactly as for the embedded code
 * blocks `snippet-shared.ts` governs.
 *
 * Two rules, and deliberately no third. {@link check} rejects, each naming file and line:
 * - a NarrativeTrace coordinate pinned to a version other than the repository's;
 * - a `*(since X)*` marker, a docs-vs-published banner line, a `registry checked` comment — the
 *   machinery the ruling removed, so a reintroduction fails rather than rots.
 *
 * A version literal that is not one of OURS is not this lint's business, and the third rule that
 * used to make it one — "any other three-part literal", with a reviewed allowlist to buy each hit
 * back — was retired on 2026-09-25. A compatibility table's "Vitest 3.2.7", an advisory note's
 * "1.5.15 -> 1.5.38", a `package.json` line for somebody else's package: every one of those is a
 * fact about another project's release rather than version talk about NarrativeTrace, so every real
 * hit the rule produced needed an exemption, and the allowlist holding them would have been a
 * second copy of other projects' release notes that went stale on each dependency bump.
 *
 * @llmNote A marker-shaped string inside a fenced block is still a marker. Fenced blocks are where
 * the install snippets live, so exempting them would blind this gate on the one surface that
 * matters most; a page that needs to *discuss* the marker syntax writes a placeholder instead.
 */

/** `0.1.3`, `1.5.38`, `0.2.0-rc.1` — two or more dotted numbers, optional qualifier. */
const VERSION = String.raw`\d+(?:\.\d+)+(?:-[A-Za-z0-9.+]+)?`;

/** `@narrativetrace/core-node@0.1.3` — the npm spec form, as typed after `npm add`/`npx` or inside
 * backticks. The `@narrativetrace/` prefix is literal, so the near-miss scope `@narrativetracex/`
 * is somebody else's package and never matches. */
const SPEC_COORDINATE = new RegExp(
  String.raw`(?<![A-Za-z0-9._-])(@narrativetrace/[A-Za-z0-9._-]+@)(${VERSION})`,
  "g",
);

/** `"@narrativetrace/core": "0.1.3"` — the `package.json` dependency form, any range prefix
 * (`^`, `~`, `>=`), which is carried through unchanged: the range is the author's choice, the
 * number is this module's. */
const DEPENDENCY_COORDINATE = new RegExp(
  String.raw`("@narrativetrace/[A-Za-z0-9._-]+"\s*:\s*"[\^~>=< ]*)(${VERSION})(")`,
  "g",
);

/** The machinery shapes ruling 7 removed, each with the message that names it. Matched against a
 * file's WHOLE text, never line by line: a marker hard-wrapped after `since` or after the
 * version's comma has neither half as a complete line of its own, so a line-based scan cannot see
 * it — the same whole-file discipline the retired publish-time rewrite had to learn. */
const MARKER_RULES: readonly { readonly pattern: RegExp; readonly message: string }[] = [
  {
    pattern: /\*\(since\b/g,
    message:
      "a *(since …)* marker is version talk — state the behaviour in the present tense instead",
  },
  {
    pattern: /\*\((?:Docs and published both at|These docs describe)\b/g,
    message:
      "the docs-vs-published banner was removed — a document describes the code it ships with",
  },
  {
    pattern: /<!--\s*registry checked/g,
    message: "the published-version registry check was removed — delete the comment",
  },
];

// -------------------------------------------------------------------------------------------
// sync — the only writer
// -------------------------------------------------------------------------------------------

function rewriteCoordinates(text: string, version: string): string {
  return text
    .replace(SPEC_COORDINATE, (_match, prefix: string) => prefix + version)
    .replace(
      DEPENDENCY_COORDINATE,
      (_match, prefix: string, _old: string, suffix: string) => prefix + version + suffix,
    );
}

/** Restamps the hash portion (never the translated or reviewed dates) of line 1 of every mirror
 * whose declared English source is in `rewrittenSources`. */
function restampMirrorsOf(repoRoot: string, rewrittenSources: ReadonlySet<string>): string[] {
  if (rewrittenSources.size === 0) return [];
  const restamped: string[] = [];
  for (const mirror of publicDocuments(repoRoot)) {
    const text = readFileSync(mirror, "utf-8");
    const header = parseHeader(text.split("\n")[0] ?? "");
    if (!header || !rewrittenSources.has(header.sourcePath)) continue;
    const source = join(repoRoot, header.sourcePath);
    if (!existsSync(source)) continue;
    const fresh = gitBlobHash12(readFileSync(source, "utf-8"));
    const rewritten = text.replace(/^(<!-- source: \S+ blob )[0-9a-f]{12}(\s*\|)/, `$1${fresh}$2`);
    if (rewritten === text) continue;
    writeFileSync(mirror, rewritten, "utf-8");
    restamped.push(`${relative(repoRoot, mirror)}: blob hash restamped`);
  }
  return restamped;
}

/**
 * Rewrites every NarrativeTrace install coordinate in every public document to `version`,
 * translated mirrors included (a coordinate is language-neutral). A mirror whose English source
 * this touched has its line-1 blob hash restamped, so a version bump leaves `translation-check`
 * green in the same run.
 *
 * @returns one line per file actually rewritten, sorted; empty when nothing needed it.
 */
export function sync(repoRoot: string, version: string): string[] {
  const changed: string[] = [];
  const rewrittenSources = new Set<string>();
  for (const file of publicDocuments(repoRoot)) {
    const original = readFileSync(file, "utf-8");
    const rewritten = rewriteCoordinates(original, version);
    if (rewritten === original) continue;
    writeFileSync(file, rewritten, "utf-8");
    const rel = relative(repoRoot, file);
    rewrittenSources.add(rel);
    changed.push(`${rel}: install coordinate -> ${version}`);
  }
  changed.push(...restampMirrorsOf(repoRoot, rewrittenSources));
  return changed.sort();
}

// -------------------------------------------------------------------------------------------
// check — the gate
// -------------------------------------------------------------------------------------------

/** The 1-based line `index` falls on. */
function lineOf(text: string, index: number): number {
  return text.slice(0, index).split("\n").length;
}

function markerProblems(rel: string, text: string): string[] {
  return MARKER_RULES.flatMap(({ pattern, message }) =>
    [...text.matchAll(pattern)].map((match) => `${rel}:${lineOf(text, match.index)}: ${message}`),
  );
}

const COORDINATE_PATTERNS = [SPEC_COORDINATE, DEPENDENCY_COORDINATE] as const;

function coordinateProblems(rel: string, text: string, version: string): string[] {
  const problems: string[] = [];
  for (const pattern of COORDINATE_PATTERNS) {
    for (const match of text.matchAll(pattern)) {
      const found = match[2] as string;
      if (found === version) continue;
      problems.push(
        `${rel}:${lineOf(text, match.index)}: NarrativeTrace coordinate pinned to ${found} but ` +
          `this repository is at ${version} — run snippet-sync, never hand-type a coordinate`,
      );
    }
  }
  return problems;
}

/** Every problem across every public document, sorted; empty when no page talks versions. */
export function check(repoRoot: string, version: string): string[] {
  const problems: string[] = [];
  for (const file of publicDocuments(repoRoot)) {
    const rel = relative(repoRoot, file);
    const text = readFileSync(file, "utf-8");
    problems.push(...markerProblems(rel, text));
    problems.push(...coordinateProblems(rel, text, version));
  }
  return problems.sort();
}
