// SPDX-License-Identifier: BUSL-1.1
// Licensed under the Business Source License 1.1 (see LICENSE); Change Date: four years from publication; Change License: Apache-2.0
// Copyright (c) 2026 Empower Agile
import type { GlossaryTerm } from "./glossary-term.js";
import type { HarvestCandidate } from "./harvest-candidate.js";
import { observationKey } from "./term-key.js";
import type { VocabularyViolation } from "./vocabulary-violation.js";

/** See the note in the glossary writer: the platform's own escaper, never a hand-rolled one. */
function quoted(value: string): string {
  return JSON.stringify(value);
}

function renderArray(entries: readonly string[]): string {
  return entries.length === 0 ? "[]" : `[\n    ${entries.join(",\n    ")}\n  ]`;
}

function newTermEntry(term: GlossaryTerm): string {
  return `{ "term": ${quoted(term.term)}, "context": ${quoted(term.context)} }`;
}

function violationEntry(violation: VocabularyViolation): string {
  const fields = [
    `"context": ${quoted(violation.context)}`,
    `"alias": ${quoted(violation.alias)}`,
    `"canonicalTerm": ${quoted(violation.canonicalTerm)}`,
    `"site": ${quoted(violation.site)}`,
    `"identifier": ${quoted(violation.identifier)}`,
  ];
  if (violation.suggestedIdentifier !== undefined) {
    fields.push(`"suggestedIdentifier": ${quoted(violation.suggestedIdentifier)}`);
  }
  fields.push(`"occurrences": ${violation.occurrences}`);
  return `{ ${fields.join(", ")} }`;
}

/** Usage is per `(context, phrase)`: how often a concept was seen, not how it happened to be spelled. */
function usageEntries(harvest: readonly HarvestCandidate[]): string[] {
  const totals = new Map<string, { candidate: HarvestCandidate; occurrences: number }>();
  for (const candidate of harvest) {
    const key = observationKey([candidate.context, candidate.phrase]);
    const seen = totals.get(key);
    if (seen === undefined) totals.set(key, { candidate, occurrences: candidate.occurrences });
    else seen.occurrences += candidate.occurrences;
  }
  return [...totals.values()].map(
    ({ candidate, occurrences }) =>
      `{ "context": ${quoted(candidate.context)}, "phrase": ${quoted(candidate.phrase)}, "occurrences": ${occurrences} }`,
  );
}

/**
 * Renders the per-run `glossary-usage.json` report.
 *
 * INTENT: the build-directory home for everything volatile — what this run added, what it
 * violated, and how often each phrase was seen. None of it belongs in the committed glossary
 * (anti-churn, ADR-012): a run that changes no vocabulary must leave `glossary.json` byte-identical
 * while still reporting what it observed.
 *
 * @param harvest the run's observations, as {@link harvestTraces} ordered them.
 * @param newTerms terms the merge added.
 * @param violations the run's vocabulary violations.
 * @returns a deterministic JSON document ending in exactly one newline. Usage totals aggregate by
 * `(context, phrase)` in first-seen order, which is the harvester's canonical order.
 * @remarks Renders text and writes nothing: this package stays free of filesystem APIs so it runs
 * unchanged in a browser test run. The caller owns the file.
 * @example
 * ```ts
 * writeFileSync(path, renderGlossaryUsageReport(harvest, newTerms, violations), "utf-8");
 * ```
 */
export function renderGlossaryUsageReport(
  harvest: readonly HarvestCandidate[],
  newTerms: readonly GlossaryTerm[],
  violations: readonly VocabularyViolation[],
): string {
  return [
    "{",
    `  "newTerms": ${renderArray(newTerms.map(newTermEntry))},`,
    `  "violations": ${renderArray(violations.map(violationEntry))},`,
    `  "usage": ${renderArray(usageEntries(harvest))}`,
    "}",
    "",
  ].join("\n");
}
