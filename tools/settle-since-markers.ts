// SPDX-License-Identifier: BUSL-1.1
// Licensed under the Business Source License 1.1 (see LICENSE); Change Date: four years from publication; Change License: Apache-2.0
// Copyright (c) 2026 Empower Agile
import { existsSync, readdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { join, relative } from "node:path";
import { refreshBannerCount } from "./llms-version-banner.js";
import { markdownAndLlmsFiles, rewriteSinceMarkersInFile } from "./publish-since-markers.js";
import { gitBlobHash12, parseHeader } from "./translation-check-discovery.js";

// The post-release marker SETTLE: the release-snapshot script's `--tag` step rewrites shipped
// "*(since X, unreleased)*" markers to drop the qualifier in the STAGED SNAPSHOT ONLY, never
// in-tree — same "stamped only at publish time" discipline as the license header. Once X is
// actually on the registry, the private tree still carries the unreleased form for it, so the
// NEXT untagged snapshot would ship "unreleased" prose for a version that has already shipped —
// and, worse, the NEXT `--tag` run's own stale-marker gate (`findStaleSinceMarkers`, which flags
// every marker whose version is <= the version being tagged) would then fail on X's own leftover
// markers. This module runs the SAME mechanical rewrite once, in-tree, right after a release —
// mechanical, never editorial.
//
// SCOPE — deliberately the same universe that actually reaches a staged public snapshot once
// .publishignore has run, not "every .md file in the repository" (a marker-shaped string in a
// source or test fixture is a fixture, never a disclosure, and must never be touched):
//   - documentation/**/*.md and documentation/**/llms.txt (English pages, translated mirrors,
//     and llms.txt alike) — EXCEPT the handful of documentation-scoped internal docs
//     .publishignore itself strips before a snapshot is ever staged (`documentation/*plan*.md`,
//     plus the three specific working documents named below): those never reach $STAGE, so
//     --tag's rewrite and stale-marker gate never see them either, and settling them here would
//     be reach past what a release actually ships.
//   - the root README.md and any top-level file that is a translated MIRROR of it (detected the
//     same way the translation-check tooling does: a line-1 `<!-- source: README.md blob ... -->`
//     header) — not every other root-level .md file (a private working note, a plan doc, ...),
//     all of which .publishignore already strips whole.
//   - each published package's own README (packages/<name>/README.md) — NOT stripped by
//     .publishignore, so these genuinely ship; verified empirically against the 0.1.3 release
//     (packages/pino, opentelemetry, observability, vitest, winston all carry the marker) —
//     leaving them unsettled would fail the *next* `--tag`'s stale-marker gate, which walks the
//     whole staged tree. Deliberately NOT a recursive walk of packages/: it must never reach
//     packages/*/__tests__/**/*.md or any other fixture two levels down.

const DOCUMENTATION_TOP_LEVEL_EXCLUSIONS = new Set([
  "event-bus-architecture-evolution.md",
  "trace-id-propagation-approach.md",
  "security-testing.md",
]);

/** Mirrors `.publishignore`'s `documentation/*plan*.md` glob (direct children of documentation/
 * only — a `*` in a bash strip pattern never crosses a `/`) plus its three named exclusions. */
function isExcludedFromSettle(repoRoot: string, absPath: string): boolean {
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
 * Every file the settle step may rewrite or restamp — see the module doc for exactly which of
 * documentation/**, the root README + its translated mirrors, and each package's own README are
 * and are not included, and why. Absolute paths.
 */
export function settleScopeFiles(repoRoot: string): string[] {
  const files: string[] = [];
  const docsRoot = join(repoRoot, "documentation");
  if (existsSync(docsRoot)) {
    for (const file of markdownAndLlmsFiles(docsRoot)) {
      if (!isExcludedFromSettle(repoRoot, file)) files.push(file);
    }
  }
  files.push(...rootReadmeAndMirrors(repoRoot));
  files.push(...packageReadmes(repoRoot));
  return files;
}

export interface SettleResult {
  /** Repo-relative paths whose shipped `since <version>, unreleased` marker(s) were rewritten,
   * sorted. */
  readonly changed: string[];
  /** Repo-relative paths of translated mirrors whose declared source's bytes ended up different
   * from how they started this run — the marker rewrite or `regenerate`, either one — and whose
   * line-1 staleness hash was restamped to match, sorted. */
  readonly mirrorsRestamped: string[];
}

/** The banner/snippet regeneration step {@link settleMarkers} runs, once, right after the marker
 * rewrite — injectable so a test never has to shell out to the real one. */
export type SettleRegenerateHook = (repoRoot: string) => void;

export interface SettleMarkersOptions {
  /** Defaults to the real `documentation/llms.txt` unreleased-count banner refresh
   * ({@link refreshBannerCount}) — the same regeneration the CLI's own pipeline used to run as a
   * separate step after this one. Folded in here so its edits are covered by the restamp pass
   * below, not left for a caller to remember. */
  readonly regenerate?: SettleRegenerateHook;
}

/** Every in-scope file's current blob hash, keyed by absolute path — `undefined` entries (a file
 * missing outright) are simply absent, never a thrown error. */
function hashScope(scope: readonly string[]): Map<string, string> {
  const hashes = new Map<string, string>();
  for (const file of scope) {
    if (existsSync(file)) hashes.set(file, gitBlobHash12(readFileSync(file, "utf-8")));
  }
  return hashes;
}

/** Restamps the hash portion (never the translated/reviewed dates) of every mirror in `scope`
 * whose declared source is `sourceRel`, to `newHash`. Returns the repo-relative mirror paths
 * actually rewritten (a mirror already carrying `newHash` is left untouched, so this is a no-op
 * on a second call for the same pair). */
function restampMirrorsOf(
  repoRoot: string,
  scope: readonly string[],
  sourceRel: string,
  newHash: string,
): string[] {
  const restamped: string[] = [];
  for (const file of scope) {
    const firstLine = readFileSync(file, "utf-8").split("\n")[0] ?? "";
    const header = parseHeader(firstLine);
    if (!header || header.sourcePath !== sourceRel) continue;
    const text = readFileSync(file, "utf-8");
    const rewritten = text.replace(
      /^(<!-- source: \S+ blob )[0-9a-f]{12}(\s*\|)/,
      `$1${newHash}$2`,
    );
    if (rewritten !== text) {
      writeFileSync(file, rewritten, "utf-8");
      restamped.push(relative(repoRoot, file));
    }
  }
  return restamped;
}

/**
 * Applies the settle rewrite in-tree, once: drops `, unreleased` from every `*(since <version>,
 * unreleased)*` marker across {@link settleScopeFiles}, then — only when at least one marker
 * actually settled — runs `regenerate` (the real banner-count refresh in production; injectable
 * the same way `runSettle`'s `fetchStatus` is) and restamps the hash portion of every translated
 * mirror whose declared English source's bytes ended up different from how they started, whether
 * the marker rewrite or `regenerate` is what changed them.
 *
 * That "whether... or" is deliberate, not incidental: `regenerate` runs over the same scope this
 * function just rewrote, and a real release's banner/snippet regeneration can change an English
 * page that carried no marker of its own at all — a page a marker-only restamp would silently
 * skip, leaving its mirror pointing at a stale pre-regeneration hash (the incident this closes).
 * Hashing every in-scope file before either step and diffing against its hash after both is what
 * catches that page too, not just the ones the marker rewrite itself touched.
 *
 * A marker citing any OTHER version is left untouched — that is a future settle's job, not this
 * one's. Never queries the registry itself (see `tools/settle-since-markers-cli.ts`, which refuses
 * to call this ahead of an actual publish).
 */
export function settleMarkers(
  repoRoot: string,
  version: string,
  options: SettleMarkersOptions = {},
): SettleResult {
  const regenerate = options.regenerate ?? refreshBannerCount;
  const scope = settleScopeFiles(repoRoot);
  const beforeHashes = hashScope(scope);

  const changedAbsolute: string[] = [];
  for (const file of scope) {
    if (rewriteSinceMarkersInFile(file, version)) changedAbsolute.push(file);
  }
  const changed = changedAbsolute.map((file) => relative(repoRoot, file)).sort();

  if (changed.length > 0) regenerate(repoRoot);

  const mirrorsRestamped: string[] = [];
  for (const file of scope) {
    if (!existsSync(file)) continue;
    const newHash = gitBlobHash12(readFileSync(file, "utf-8"));
    if (newHash === beforeHashes.get(file)) continue;
    mirrorsRestamped.push(...restampMirrorsOf(repoRoot, scope, relative(repoRoot, file), newHash));
  }

  return { changed, mirrorsRestamped: [...new Set(mirrorsRestamped)].sort() };
}
