// SPDX-License-Identifier: BUSL-1.1
// Licensed under the Business Source License 1.1 (see LICENSE); Change Date: four years from publication; Change License: Apache-2.0
// Copyright (c) 2026 Empower Agile
import { existsSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { type DomainVocabulary, emptyVocabulary } from "@narrativetrace/clarity";
import { readProjectVocabulary, type VocabularyFileReader } from "@narrativetrace/glossary";

/** Environment variable naming the directory that holds the committed glossary. */
export const GLOSSARY_DIR_ENV = "NARRATIVETRACE_GLOSSARY_DIR";

/**
 * The real filesystem, as the glossary reader sees it.
 *
 * @remarks Exported so a caller scoring outside the fixture can reuse it, and so its three
 * one-liners are directly testable — an injected fake would otherwise be the only thing ever
 * exercised.
 */
export const nodeFileReader: VocabularyFileReader = {
  isFile: (path) => existsSync(path) && statSync(path).isFile(),
  readText: (path) => readFileSync(path, "utf8"),
  join: (...segments) => join(...segments),
};

let cached: DomainVocabulary | undefined;

/**
 * The repository's committed glossary, read as the vocabulary clarity scores with.
 *
 * INTENT: unlike harvesting, reading is unconditional — it changes nothing on disk, and a project
 * that curates its ubiquitous language should not have to opt in to being scored in it. Only the
 * committed file counts: nothing this run harvests feeds back into its own scores, which would
 * make them non-deterministic and self-certifying.
 *
 * @remarks Memoized per worker process: every test in a worker scores against the same glossary,
 * and re-reading it per test would be pure IO. A glossary that cannot be read degrades to the
 * built-in dictionaries with a warning — a reporting artifact must never fail the suite that
 * produced it.
 */
export function projectVocabulary(
  env: Record<string, string | undefined> = process.env,
  files: VocabularyFileReader = nodeFileReader,
  warn: (message: string) => void = (message) => process.stderr.write(`${message}\n`),
): DomainVocabulary {
  if (cached !== undefined) return cached;
  const glossaryDir = env[GLOSSARY_DIR_ENV] ?? ".";
  try {
    cached = readProjectVocabulary(glossaryDir, files);
  } catch (e) {
    warn(
      `narrative-trace: committed glossary at ${glossaryDir} could not be read, ` +
        `scoring with the built-in dictionaries only (${String(e)})`,
    );
    cached = emptyVocabulary;
  }
  return cached;
}

/** Drops the memoized vocabulary; tests use it to observe a different glossary. */
export function resetProjectVocabulary(): void {
  cached = undefined;
}
