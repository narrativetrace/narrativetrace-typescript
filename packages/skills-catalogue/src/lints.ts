// SPDX-License-Identifier: BUSL-1.1
// Licensed under the Business Source License 1.1 (see LICENSE); Change Date: four years from publication; Change License: Apache-2.0
// Copyright (c) 2026 Empower Agile
import type { ProListing } from "./pro-listing.js";
import { commandStrings, firstToken, type Skill, vocabularyViolations } from "./skill.js";

export { descriptionFitsBudget, stepsWithoutVerify, vocabularyViolations } from "./skill.js";

/**
 * A conservative character-based proxy for the ~15k-token catalogue-wide budget (skill-design.md
 * §1: "exceed it and skills are dropped SILENTLY"). No tokenizer dependency: ~4 chars/token is a
 * safe under-estimate of token count for English prose, so a char budget well under 15k × 4 leaves
 * margin on both sides of that approximation.
 */
export const CATALOGUE_CHAR_BUDGET = 40_000;

export function catalogueDescriptionChars(skills: readonly Skill[]): number {
  return skills.reduce((sum, skill) => sum + skill.description.length, 0);
}

/** Every `commands` string whose first token is outside the closed vocabulary, across the whole catalogue. */
export function catalogueVocabularyViolations(skills: readonly Skill[]): readonly string[] {
  return skills.flatMap(vocabularyViolations);
}

/** Sanity companion to {@link vocabularyViolations}: every command actually parses to a non-empty first token. */
export function unparseableCommands(skills: readonly Skill[]): readonly string[] {
  return skills.flatMap((skill) =>
    commandStrings(skill)
      .filter((cmd) => firstToken(cmd) === "")
      .map((cmd) => `${skill.canonicalName}: '${cmd}'`),
  );
}

/**
 * A Pro listing's recorded `featureGuideStatusText` must still appear verbatim in the feature
 * guide's own text — catches the listing silently drifting out of sync with the doc it claims to
 * summarize (status must agree with the runtime's feature guide).
 */
export function listingsDisagreeingWithFeatureGuide(
  listings: readonly ProListing[],
  featureGuideText: string,
): readonly string[] {
  return listings
    .filter((listing) => !featureGuideText.includes(listing.featureGuideStatusText))
    .map((listing) => listing.canonicalName);
}

const SECTION_MARK = "§";
const MD_FILENAME = /\b[\w.-]+\.md\b/gi;

/**
 * Every prose string a rendered `SKILL.md`/`AGENTS.md` snippet actually shows for `skill` — never
 * `canonicalName` (an identifier, not prose) and never a `snippet` step's resolved file content
 * (real source, not the catalogue's own words).
 */
function proseOf(skill: Skill): readonly string[] {
  const pieces: string[] = [skill.description];
  if (skill.whenToUse) pieces.push(skill.whenToUse);
  for (const step of skill.steps) {
    pieces.push(step.title);
    if (step.flag) pieces.push(step.flag);
    if (step.verify) pieces.push(step.verify);
    if (step.body.kind === "commands") pieces.push(...step.body.commands);
    for (const note of step.failure ?? []) pieces.push(note.symptom, note.cause, note.fix);
  }
  for (const rule of [...skill.always, ...skill.never]) pieces.push(rule.rule, rule.reason);
  return pieces;
}

/**
 * Tier A lint: no `§` section-mark citation, and no `.md` filename
 * that isn't itself a real file in THIS repository, may appear in a skill's rendered prose. Catches
 * a private planning-note citation before it ships in `SKILL.md`/the `AGENTS.md` snippet —
 * rationale sentences are fine, the citation naming the note is not. `repoMarkdownBasenames` is
 * injected (never `fs` in this module) so the lint stays a pure function over the catalogue, like
 * every other one here; the caller supplies the real repo listing.
 */
export function citationViolations(
  skill: Skill,
  repoMarkdownBasenames: ReadonlySet<string> = new Set(),
): readonly string[] {
  const violations: string[] = [];
  for (const text of proseOf(skill)) {
    if (text.includes(SECTION_MARK)) {
      violations.push(`${skill.canonicalName}: section-mark citation in "${text}"`);
    }
    for (const match of text.matchAll(MD_FILENAME)) {
      if (!repoMarkdownBasenames.has(match[0].toLowerCase())) {
        violations.push(
          `${skill.canonicalName}: external filename citation "${match[0]}" in "${text}"`,
        );
      }
    }
  }
  return violations;
}
