// SPDX-License-Identifier: BUSL-1.1
// Licensed under the Business Source License 1.1 (see LICENSE); Change Date: four years from publication; Change License: Apache-2.0
// Copyright (c) 2026 Empower Agile
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { parseHeader } from "./translation-check-discovery.js";

// The universe of PUBLIC documents — every page that actually reaches a staged public snapshot
// once `.publishignore` has run, and nothing else. One definition, shared by every tool that has
// to reason about "what a reader outside this repository can see": a marker-shaped or
// version-shaped string in a source file, a test fixture or a private working note is a fixture or
// a note, never a disclosure, and must never be rewritten or gated as though it were published.
//
// SCOPE, and why each part is drawn the way it is:
//   - `documentation/**/*.md` and `documentation/**/llms.txt` (English pages, translated mirrors
//     and `llms.txt` alike) — EXCEPT the documentation-scoped internal docs `.publishignore`
//     itself strips before a snapshot is ever staged (`documentation/*plan*.md`, plus the three
//     specific working documents named below): those never reach the stage, so reaching them here
//     would be reaching past what a release actually ships.
//   - the root `README.md` and any top-level file that is a translated MIRROR of it (detected the
//     same way the translation tooling does: a line-1 `<!-- source: README.md blob ... -->`
//     header) — not every other root-level `.md` file (a private working note, a plan doc, ...),
//     all of which `.publishignore` already strips whole.
//   - each published package's own README (`packages/<name>/README.md`) — NOT stripped by
//     `.publishignore`, so these genuinely ship. Deliberately NOT a recursive walk of `packages/`:
//     it must never reach `packages/*/__tests__/**/*.md` or any other fixture two levels down.

/** Every `*.md`/`llms.txt` file under `root`, found by walking the tree — absolute paths, in
 * directory-listing order; making them root-relative is the caller's job. */
export function markdownAndLlmsFiles(root: string): string[] {
  const files: string[] = [];
  const walk = (dir: string): void => {
    for (const name of readdirSync(dir)) {
      const full = join(dir, name);
      if (statSync(full).isDirectory()) {
        walk(full);
      } else if (name.endsWith(".md") || name === "llms.txt") {
        files.push(full);
      }
    }
  };
  walk(root);
  return files;
}

const DOCUMENTATION_TOP_LEVEL_EXCLUSIONS = new Set([
  "event-bus-architecture-evolution.md",
  "trace-id-propagation-approach.md",
  "security-testing.md",
]);

/** Mirrors `.publishignore`'s `documentation/*plan*.md` glob (direct children of `documentation/`
 * only — a `*` in a bash strip pattern never crosses a `/`) plus its three named exclusions. */
function isStrippedFromSnapshot(repoRoot: string, absPath: string): boolean {
  const rel = relative(join(repoRoot, "documentation"), absPath);
  if (rel.includes("/")) return false; // nested under a language dir — never excluded here
  return rel.includes("plan") || DOCUMENTATION_TOP_LEVEL_EXCLUSIONS.has(rel);
}

/** Every top-level `*.md` file directly under `repoRoot` that is either `README.md` itself or a
 * translated mirror of it (line-1 `<!-- source: README.md ... -->` header) — never a recursive
 * walk, so a root-level private working doc (a task list, a `*-plan.md`, ...) is never a
 * candidate; those carry no such header and are not named `README.md`. */
function rootReadmeAndMirrors(repoRoot: string): string[] {
  const files: string[] = [];
  for (const name of readdirSync(repoRoot)) {
    if (!name.endsWith(".md")) continue;
    const full = join(repoRoot, name);
    if (!statSync(full).isFile()) continue;
    if (name === "README.md") {
      files.push(full);
      continue;
    }
    const firstLine = readFileSync(full, "utf-8").split("\n")[0] ?? "";
    if (parseHeader(firstLine)?.sourcePath === "README.md") files.push(full);
  }
  return files;
}

/** Every published package's own README — `packages/<name>/README.md`, one level deep only. */
function packageReadmes(repoRoot: string): string[] {
  const packagesRoot = join(repoRoot, "packages");
  if (!existsSync(packagesRoot)) return [];
  const files: string[] = [];
  for (const name of readdirSync(packagesRoot)) {
    const readme = join(packagesRoot, name, "README.md");
    if (existsSync(readme) && statSync(readme).isFile()) files.push(readme);
  }
  return files;
}

/**
 * Every public document in `repoRoot` — see the module doc for exactly which of `documentation/**`,
 * the root README + its translated mirrors, and each package's own README are and are not
 * included, and why. Absolute paths.
 */
export function publicDocuments(repoRoot: string): string[] {
  const files: string[] = [];
  const docsRoot = join(repoRoot, "documentation");
  if (existsSync(docsRoot)) {
    for (const file of markdownAndLlmsFiles(docsRoot)) {
      if (!isStrippedFromSnapshot(repoRoot, file)) files.push(file);
    }
  }
  files.push(...rootReadmeAndMirrors(repoRoot));
  files.push(...packageReadmes(repoRoot));
  return files;
}
