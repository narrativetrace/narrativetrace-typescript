// SPDX-License-Identifier: BUSL-1.1
// Licensed under the Business Source License 1.1 (see LICENSE); Change Date: four years from publication; Change License: Apache-2.0
// Copyright (c) 2026 Empower Agile
import { readdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { join, relative } from "node:path";

// Whitespace-tolerant, whole-file matching for the "since X.Y.Z, unreleased" marker shape a
// release must never ship — used by the publish pipeline's `--tag` transform: the marker
// REWRITE (drops ", unreleased" from a marker citing the version just tagged) and its "no stale
// marker survives" GATE. Both walk `*.md` + `llms.txt` files under a staged snapshot directory and
// read each one WHOLE rather than line by line: a marker wrapped across a Markdown hard-wrap
// (`*(since\n0.1.3, unreleased)*` right after `since`, or `*(since 0.1.3,\nunreleased)*` right
// after the version's comma) has neither half as a complete line on its own, so a line-based
// grep/sed can never see it (owner ruling, 2026-09-12 — mirrors the whitespace tolerance
// `llms-version-banner.ts`'s `UNRELEASED_MARKER_RE` already has for the bare marker COUNT; this
// module applies the same tolerance to the version-specific REWRITE and STALENESS shapes the
// publish script needs, which cite an exact version rather than any version).

/** Every `*.md`/`llms.txt` file under `root`, found by walking the tree — root-relative paths are
 * the caller's job (see {@link rewriteSinceMarkers}/{@link findStaleSinceMarkers}). */
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

/** `since VERSION, unreleased)*`, whitespace-tolerant around both wrap points, for one EXACT
 * version — a marker citing a different (typically later, not-yet-cut) version is left alone on
 * purpose, so this is anchored rather than matching any version the way
 * `llms-version-banner.ts`'s `UNRELEASED_MARKER_RE` does. */
function sinceMarkerFor(version: string): RegExp {
  const escaped = version.replace(/[.+]/g, "\\$&");
  return new RegExp(`since\\s+${escaped},\\s*unreleased\\)\\*`, "g");
}

/**
 * Rewrites every `since VERSION, unreleased)*` marker in `file` to `since VERSION)*`, in place,
 * whole-file and whitespace-tolerant (see module doc). Shared by {@link rewriteSinceMarkers}
 * (which walks a whole tree) and the post-release settle step (`tools/settle-since-markers.ts`),
 * which rewrites the same way over a different, narrower file list — same regex, same semantics,
 * one place either caller can drift from if it ever changes.
 *
 * @returns whether `file`'s content actually changed.
 */
export function rewriteSinceMarkersInFile(file: string, version: string): boolean {
  const pattern = sinceMarkerFor(version);
  const replacement = `since ${version})*`;
  const before = readFileSync(file, "utf-8");
  const after = before.replace(pattern, replacement);
  if (after === before) return false;
  writeFileSync(file, after, "utf-8");
  return true;
}

/**
 * Rewrites every `since VERSION, unreleased)*` marker under `root` to `since VERSION)*`, in place,
 * whole-file and whitespace-tolerant (see module doc) — never in-tree, only ever against a staged
 * snapshot directory.
 *
 * @returns the root-relative path of every file actually changed, in the order
 * {@link markdownAndLlmsFiles} finds them — the publish script uses this list to know which
 * translated mirrors' staleness hash needs restamping.
 */
export function rewriteSinceMarkers(root: string, version: string): string[] {
  const changed: string[] = [];
  for (const file of markdownAndLlmsFiles(root)) {
    if (rewriteSinceMarkersInFile(file, version)) changed.push(relative(root, file));
  }
  return changed;
}

/** `X.Y.Z` split into numeric parts, or `undefined` for anything else — the only shape this
 * family's markers ever cite (plain, no pre-release/build metadata). */
function versionParts(version: string): readonly number[] | undefined {
  const match = /^([0-9]+)\.([0-9]+)\.([0-9]+)$/.exec(version);
  return match ? [Number(match[1]), Number(match[2]), Number(match[3])] : undefined;
}

/** `a <= b`; either side failing to parse is treated as suspicious and flagged (`true`, "stale"),
 * never silently ignored — a differently-shaped version string cannot be ordered, so the safe
 * default is to surface it for a human to look at. */
function versionLe(a: readonly number[] | undefined, b: readonly number[] | undefined): boolean {
  if (a === undefined || b === undefined) return true;
  for (let i = 0; i < 3; i++) {
    if ((a[i] as number) !== (b[i] as number)) return (a[i] as number) < (b[i] as number);
  }
  return true;
}

const STALE_MARKER_RE = /since\s+([0-9][0-9A-Za-z.+-]*),\s*unreleased\)\*/g;

/**
 * Every surviving `since X, unreleased)*` marker under `root` whose cited version X is `<=`
 * `snapshotVersion` — the ones a release must never ship, whether the rewrite step above missed
 * them (a mismatched version argument) or they were never meant to be rewritten in the first
 * place. Reads each file WHOLE (see module doc), so a marker wrapped across a hard-wrap is caught
 * here even where a line-based scan would miss it.
 *
 * @returns one `"path:line: since X"` string per hit, root-relative.
 */
export function findStaleSinceMarkers(root: string, snapshotVersion: string): string[] {
  const target = versionParts(snapshotVersion);
  const hits: string[] = [];
  for (const file of markdownAndLlmsFiles(root)) {
    const text = readFileSync(file, "utf-8");
    for (const match of text.matchAll(STALE_MARKER_RE)) {
      const cited = match[1] as string;
      if (versionLe(versionParts(cited), target)) {
        const line = text.slice(0, match.index).split("\n").length;
        hits.push(`${relative(root, file)}:${line}: since ${cited}`);
      }
    }
  }
  return hits;
}
