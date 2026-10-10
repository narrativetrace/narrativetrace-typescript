// SPDX-License-Identifier: BUSL-1.1
// Licensed under the Business Source License 1.1 (see LICENSE); Change Date: four years from publication; Change License: Apache-2.0
// Copyright (c) 2026 Empower Agile
import type { ProListing } from "./pro-listing.js";
import {
  allowedToolsViolations,
  commandStrings,
  firstToken,
  type Skill,
  vocabularyViolations,
} from "./skill.js";

export {
  allowedToolsViolations,
  descriptionFitsBudget,
  stepsWithoutVerify,
  vocabularyViolations,
} from "./skill.js";

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

/** Every `allowedTools` entry outside the closed vocabulary (or already rendered), across the catalogue. */
export function catalogueAllowedToolsViolations(skills: readonly Skill[]): readonly string[] {
  return skills.flatMap(allowedToolsViolations);
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

/**
 * A command that files something public: the verb as a word of its own. A pattern, not a literal,
 * because a port's spelling of the verb differs from the others' and a second publishing command is
 * a question somebody has to answer, not a regex somebody widens. A path or a quoted string that
 * merely contains the word (`node -e "...'feedback'..."`) is not the verb.
 */
const PUBLISHING_COMMAND = /(^|\s)feedback(\s|$)/;

/** An `allowedTools` entry grants `token`, bare or already spelled as the vendor's `Bash(token *)` rule. */
function preApproves(entry: string, token: string): boolean {
  return entry === token || entry === `Bash(${token})` || entry.startsWith(`Bash(${token} `);
}

/**
 * A skill whose steps can make something public must declare NO allowed tool that would pre-approve
 * the command doing it.
 *
 * INTENT: the Claude flavour's `allowed-tools` grants its listed tools for the turn that LOADS the
 * skill, without prompting. A reporting skill that declared `npx` would therefore pre-approve its
 * own reporting command, and the harness would stop asking exactly where asking is the product.
 * The absence of the field is the safety property, so it is linted rather than left to whoever
 * edits the catalogue next.
 *
 * @llmNote Named `sendNotPreApproved` in the design, before the private endpoint was deferred and
 * "send" became "file publicly". Same rule, honest name: nothing is sent anywhere, and what must not
 * be pre-approved is the step that publishes.
 */
export function publishingNotPreApproved(skills: readonly Skill[]): readonly string[] {
  return skills.flatMap((skill) =>
    commandStrings(skill)
      .filter((command) => PUBLISHING_COMMAND.test(command))
      .filter((command) =>
        skill.allowedTools.some((tool) => preApproves(tool, firstToken(command))),
      )
      .map(
        (command) =>
          `${skill.canonicalName}: declares allowed tool "${firstToken(command)}", which pre-approves its own publishing command "${command}" — a skill that files something public must let the harness ask`,
      ),
  );
}

/** The approve verb, as a binary (by name or by path) or as the package script the docs name. */
const PROMOTION_COMMAND = /(^|[\s/])(narrativetrace-approve|approve-narratives)(\s|$)/;

/** Every command a skill runs: its steps' commands AND their verify commands, which run too. */
function everyCommand(skill: Skill): readonly string[] {
  const verifies = skill.steps.flatMap((step) => (step.verify === undefined ? [] : [step.verify]));
  return [...commandStrings(skill), ...verifies];
}

/**
 * A skill that promotes a `.received.nt` to its committed `.approved.nt` — in any step command or
 * verify command, the verb by name or by path — must declare NO allowed tool. Port of Java `Lints#promotionNotPreApproved`, stricter by one entry: Java allows its
 * read-only `find`; this port's vocabulary (`pnpm`/`npx`/`node`/`git`) has no tool that is
 * read-only by nature, and every one of them can run the promotion — so any declared tool
 * pre-approves the pinning in the turn the approval gate says must stop.
 *
 * @returns one message per promoting skill that declares a tool; empty when the rule holds.
 */
export function promotionNotPreApproved(skills: readonly Skill[]): readonly string[] {
  return skills
    .filter((skill) => everyCommand(skill).some((command) => PROMOTION_COMMAND.test(command)))
    .filter((skill) => skill.allowedTools.length > 0)
    .map(
      (skill) =>
        `${skill.canonicalName}: declares allowed tools ${JSON.stringify(skill.allowedTools)} while it promotes an approval baseline — a skill that pins must let the harness ask`,
    );
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
    if (step.condition) pieces.push(step.condition);
    if (step.verify) pieces.push(step.verify);
    if (step.body.kind === "commands") pieces.push(...step.body.commands);
    for (const note of step.failure ?? []) pieces.push(note.symptom, note.cause, note.fix);
  }
  for (const section of skill.references ?? []) pieces.push(section.heading, section.markdown);
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
