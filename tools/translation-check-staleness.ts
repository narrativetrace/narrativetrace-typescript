// SPDX-License-Identifier: BUSL-1.1
// Licensed under the Business Source License 1.1 (see LICENSE); Change Date: four years from publication; Change License: Apache-2.0
// Copyright (c) 2026 Empower Agile
import { existsSync, readFileSync } from "node:fs";
import {
  gitBlobHash12,
  isLanguageDirFile,
  parseHeader,
  walkMarkdownFiles,
} from "./translation-check-discovery.js";

function verifyHeader(path: string, sourcePath: string, blobHashPrefix: string): string[] {
  if (sourcePath.includes(".."))
    return [`${path}: source path '${sourcePath}' escapes the repository root`];
  if (!existsSync(sourcePath)) return [`${path}: header references missing source '${sourcePath}'`];
  const actual = gitBlobHash12(readFileSync(sourcePath, "utf-8"));
  if (actual === blobHashPrefix) return [];
  return [
    `${path}: stale — header records ${blobHashPrefix} but '${sourcePath}' is now ${actual}; re-translate the delta and restamp line 1`,
  ];
}

function checkFile(path: string): string[] {
  const firstLine = readFileSync(path, "utf-8").split("\n")[0] ?? "";
  const header = parseHeader(firstLine);
  if (!header) {
    return isLanguageDirFile(path)
      ? [`${path}: missing or malformed translation header on line 1`]
      : [];
  }
  return verifyHeader(path, header.sourcePath, header.blobHashPrefix);
}

/**
 * Staleness across every markdown file in the repository.
 *
 * @returns one message per problem: a language-directory file with no valid header, or any
 * headered file whose recorded blob hash no longer matches its source's current content.
 */
export function staleness(): string[] {
  return walkMarkdownFiles().flatMap(checkFile).sort();
}
