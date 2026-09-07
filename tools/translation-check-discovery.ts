// SPDX-License-Identifier: BUSL-1.1
// Licensed under the Business Source License 1.1 (see LICENSE); Change Date: four years from publication; Change License: Apache-2.0
// Copyright (c) 2026 Empower Agile
import { createHash } from "node:crypto";
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

const HEADER =
  /^<!-- source: (\S+) blob ([0-9a-f]{12}) \| translated: \d{4}-\d{2}-\d{2}(?: \| reviewed: (\d{4}-\d{2}-\d{2}|-))? -->$/;

export interface TranslationHeader {
  readonly sourcePath: string;
  readonly blobHashPrefix: string;
  readonly reviewed: string | undefined;
}

/**
 * Computes git's own blob hash — sha1("blob " + byteLength + "\0" + bytes) — over UTF-8 content.
 *
 * INTENT: reproduces `git hash-object <file> | cut -c1-12` without shelling out to git, so the
 * staleness check has no process-spawn or PATH dependency.
 */
export function gitBlobHash12(content: string): string {
  const bytes = Buffer.from(content, "utf-8");
  const digest = createHash("sha1");
  digest.update(`blob ${bytes.length}\0`);
  digest.update(bytes);
  return digest.digest("hex").slice(0, 12);
}

/** Parses line 1 of a translated file, or `undefined` when it carries no valid header. */
export function parseHeader(firstLine: string): TranslationHeader | undefined {
  const match = HEADER.exec(firstLine.trim());
  if (!match) return undefined;
  const reviewed = match[3];
  return {
    sourcePath: match[1] as string,
    blobHashPrefix: match[2] as string,
    reviewed: reviewed && reviewed !== "-" ? reviewed : undefined,
  };
}

/** A file under `documentation/<lang>/` (any subdirectory of `documentation/` except `i18n`) — a translation header is mandatory there. */
export function isLanguageDirFile(path: string): boolean {
  return /^documentation\/(?!i18n\/)[^/]+\//.test(path);
}

const SKIPPED_DIRS = new Set(["node_modules", "dist", "coverage"]);

function walk(dir: string): string[] {
  if (!existsSync(dir)) return [];
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) {
      const skip = entry.name.startsWith(".") || SKIPPED_DIRS.has(entry.name);
      return skip ? [] : walk(path);
    }
    return entry.name.endsWith(".md") ? [path] : [];
  });
}

/** Every markdown file in the repository, repo-relative, sorted. */
export function walkMarkdownFiles(): string[] {
  return walk(".").sort();
}

function hasValidHeader(path: string): boolean {
  return parseHeader(readFileSync(path, "utf-8").split("\n")[0] ?? "") !== undefined;
}

/** Every translated file: anything repo-wide carrying a valid line-1 translation header. */
export function translatedFiles(): string[] {
  return walkMarkdownFiles().filter(hasValidHeader);
}
