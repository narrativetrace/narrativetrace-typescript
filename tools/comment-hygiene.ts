// SPDX-License-Identifier: BUSL-1.1
// Licensed under the Business Source License 1.1 (see LICENSE); Change Date: four years from publication; Change License: Apache-2.0
// Copyright (c) 2026 Empower Agile
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";

/**
 * The mechanical subset of "rule first, history last" a lint can catch without judgment: an
 * explicit governance citation (`owner ruling`, `ruled 20YY-...`), a bare audit/ruling date in
 * parens (`(20YY-MM-DD)`), or shipped-release wording (`, unreleased)`) as it would read INSIDE a
 * source comment. A code comment carries the constraint an agent must respect, not the ledger
 * entry that produced it — that history belongs in the commit that made the change, not in the
 * comment that survives it. (`, unreleased)*` DOC markers live in `documentation/*.md`, a
 * different mechanism entirely — this pattern only ever scans `packages/*​/src`, never
 * `documentation/`, so it can never collide with them.)
 */
export const HISTORY_PATTERN = /owner ruling|ruled 20\d\d|\(20\d\d-\d\d-\d\d\)|, unreleased\)/;

export interface CommentHygieneHit {
  /** Repo-relative, POSIX-separated. */
  readonly file: string;
  readonly line: number;
  readonly text: string;
}

function walk(dir: string, files: string[]): void {
  for (const name of readdirSync(dir)) {
    const full = join(dir, name);
    if (statSync(full).isDirectory()) {
      walk(full, files);
    } else if (name.endsWith(".ts")) {
      files.push(full);
    }
  }
}

/**
 * Every `.ts` file under `<repoRoot>/packages/<name>/src/**` (any package with a `src` directory)
 * — never `__tests__` (a sibling of `src` in every package, never nested inside it), never
 * `dist`/`node_modules`/build output, since this only ever walks a package's own `src` subtree.
 * Absolute paths, sorted.
 */
export function packagesSourceFiles(repoRoot: string): string[] {
  const packagesRoot = join(repoRoot, "packages");
  if (!existsSync(packagesRoot)) return [];
  const files: string[] = [];
  for (const name of readdirSync(packagesRoot)) {
    const src = join(packagesRoot, name, "src");
    if (existsSync(src) && statSync(src).isDirectory()) walk(src, files);
  }
  return files.sort();
}

/** Every line in `content` matching {@link HISTORY_PATTERN}, 1-indexed. */
function linesMatching(content: string): { line: number; text: string }[] {
  const hits: { line: number; text: string }[] = [];
  content.split("\n").forEach((text, index) => {
    if (HISTORY_PATTERN.test(text)) hits.push({ line: index + 1, text: text.trim() });
  });
  return hits;
}

/** Every {@link HISTORY_PATTERN} hit across {@link packagesSourceFiles}, repo-relative and sorted
 * by file then line — allowlist filtering is the caller's job (see `lint`). */
export function findHistoryComments(repoRoot: string): CommentHygieneHit[] {
  const hits: CommentHygieneHit[] = [];
  for (const file of packagesSourceFiles(repoRoot)) {
    const rel = relative(repoRoot, file);
    for (const { line, text } of linesMatching(readFileSync(file, "utf-8"))) {
      hits.push({ file: rel, line, text });
    }
  }
  return hits;
}

export interface LintResult {
  /** Hits outside the allowlist — a red gate: `pnpm run check` must fail on these. */
  readonly violations: readonly CommentHygieneHit[];
  /** Allowlist entries naming a file with zero current hits — the allowlist is meant to shrink as
   * each package's own wave lands, never to accumulate dead entries a later wave forgot to
   * remove. */
  readonly staleAllowlistEntries: readonly string[];
}

/**
 * Lints `packages/*​/src` for {@link HISTORY_PATTERN}, excusing exactly the files named in
 * `allowlist` (repo-relative, POSIX-separated paths, each mapped to a human reason — enforced by
 * the caller, never read here). An allowlisted file that no longer has ANY hit is flagged too
 * (`staleAllowlistEntries`): the allowlist is meant to shrink as each package's comment-hygiene
 * wave lands, not to accumulate entries nobody has to remove.
 */
export function lint(repoRoot: string, allowlist: ReadonlyMap<string, string>): LintResult {
  const hits = findHistoryComments(repoRoot);
  const hitFiles = new Set(hits.map((hit) => hit.file));
  return {
    violations: hits.filter((hit) => !allowlist.has(hit.file)),
    staleAllowlistEntries: [...allowlist.keys()].filter((file) => !hitFiles.has(file)).sort(),
  };
}
