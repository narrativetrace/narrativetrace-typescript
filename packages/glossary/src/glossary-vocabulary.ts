// SPDX-License-Identifier: BUSL-1.1
// Licensed under the Business Source License 1.1 (see LICENSE); Change Date: four years from publication; Change License: Apache-2.0
// Copyright (c) 2026 Empower Agile
import { type DomainVocabulary, domainVocabulary, emptyVocabulary } from "@narrativetrace/clarity";
import type { Glossary } from "./glossary.js";
import { readGlossaryJson } from "./glossary-json-reader.js";
import type { GlossaryTerm } from "./glossary-term.js";

/** Name of the committed glossary file, as the suite harvest writes it. */
export const GLOSSARY_FILE = "glossary.json";

/**
 * Maps a committed glossary onto the vocabulary the clarity scorers consult.
 *
 * INTENT: one file, one review workflow. The glossary a team already curates (ADR-012) is the only
 * place a project declares domain vocabulary — there is no second clarity dictionary file to keep
 * in sync.
 *
 * @remarks A verb phrase contributes its leading verb as a domain verb and the rest as domain
 * nouns (`settle trade` → verb `settle`, noun `trade`); words and noun phrases contribute every
 * token as a domain noun. Multi-word terms therefore still teach, one token at a time, which is
 * the granularity identifiers are scored at.
 *
 * Three exclusions make the mapping trustworthy: deprecated synonyms are never vocabulary (an
 * alias exists to be flagged, and promoting it would silence the very issue it is declared for),
 * `template` entries are raw narration rather than words, and `stale` terms carry an explicit
 * human statement that the word left the domain. `harvested` terms do count — the commit is the
 * approval.
 *
 * Bounded contexts are flattened: clarity scores identifiers, which carry no package, so every
 * context's vocabulary applies everywhere.
 *
 * Accepted shorthand comes from the `abbreviations` section alone, never from the terms. A token
 * of a committed phrase teaches as a domain noun — that is the scoring win — but it does not
 * accept the token as shorthand: harvesting `calc total` must not silently drop the
 * `calc → calculate` hint repository-wide, because nobody read `calc` when they approved it.
 */
export function glossaryVocabulary(glossary: Glossary): DomainVocabulary {
  const verbs = new Set<string>();
  const nouns = new Set<string>();
  for (const term of glossary.terms) {
    collect(term, verbs, nouns);
  }
  return domainVocabulary(verbs, nouns, glossary.abbreviations);
}

function collect(term: GlossaryTerm, verbs: Set<string>, nouns: Set<string>): void {
  if (term.status === "stale" || term.kind === "template") return;
  const tokens = term.term.split(" ");
  if (term.kind === "verb-phrase") {
    verbs.add(tokens[0] as string);
    for (const token of tokens.slice(1)) nouns.add(token);
    return;
  }
  for (const token of tokens) nouns.add(token);
}

/** The filesystem calls {@link readProjectVocabulary} needs, injected so it stays testable. */
export interface VocabularyFileReader {
  /** Whether the path names a readable regular file. */
  isFile(path: string): boolean;
  /** Reads the file as UTF-8 text. */
  readText(path: string): string;
  /** Joins path segments the way the host platform does. */
  join(...segments: string[]): string;
}

/**
 * Reads the committed glossary from the directory holding it.
 *
 * @remarks A missing directory, an absent `glossary.json`, and an undefined directory all mean the
 * same thing — the project has declared no vocabulary — and yield the empty vocabulary. A glossary
 * that exists but cannot be parsed is a different matter and throws, mirroring
 * {@link readGlossaryJson}'s fail-loudly contract: a committed file with a typo is a defect, not
 * an absence.
 */
export function readProjectVocabulary(
  glossaryDir: string | undefined,
  files: VocabularyFileReader,
): DomainVocabulary {
  if (glossaryDir === undefined) return emptyVocabulary;
  const file = files.join(glossaryDir, GLOSSARY_FILE);
  if (!files.isFile(file)) return emptyVocabulary;
  return glossaryVocabulary(readGlossaryJson(files.readText(file)));
}
