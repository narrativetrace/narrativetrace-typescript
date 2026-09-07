// SPDX-License-Identifier: BUSL-1.1
// Licensed under the Business Source License 1.1 (see LICENSE); Change Date: four years from publication; Change License: Apache-2.0
// Copyright (c) 2026 Empower Agile
import type { BoundedContext } from "./bounded-context.js";
import type { Glossary } from "./glossary.js";
import type { GlossaryTerm } from "./glossary-term.js";
import type { SynonymAlias } from "./synonym-alias.js";
import { byKey } from "./text-order.js";

/**
 * Quotes and escapes one string as a JSON string literal.
 *
 * @llmNote Do not hand-roll an escaper here. `JSON.stringify` of a string is the platform's own
 * RFC 8259 escaper — it matches the Java runtime's `JsonEscape` output for every input the
 * glossary can hold, and it additionally repairs lone surrogates.
 */
function quoted(value: string): string {
  return JSON.stringify(value);
}

/** Renders a string list inline: `["a", "b"]`, or `[]` when empty. */
function inlineArray(values: readonly string[]): string {
  return `[${values.map(quoted).join(", ")}]`;
}

function renderContext(context: BoundedContext): string {
  const fields = [`      "packages": ${inlineArray(context.packages)}`];
  if (context.description !== undefined) {
    fields.push(`      "description": ${quoted(context.description)}`);
  }
  return `    ${quoted(context.name)}: {\n${fields.join(",\n")}\n    }`;
}

function renderContexts(glossary: Glossary): string {
  if (glossary.contexts.size === 0) return "{}";
  const rendered = byKey(glossary.contexts).map(([, context]) => renderContext(context));
  return `{\n${rendered.join(",\n")}\n  }`;
}

function renderAbbreviations(model: Glossary): string {
  const rendered = byKey(model.abbreviations).map(
    ([abbreviation, expansion]) => `    ${quoted(abbreviation)}: ${quoted(expansion)}`,
  );
  return `{\n${rendered.join(",\n")}\n  }`;
}

function renderTranslations(translations: ReadonlyMap<string, string>): string {
  const rendered = byKey(translations).map(
    ([locale, text]) => `        ${quoted(locale)}: ${quoted(text)}`,
  );
  return `{\n${rendered.join(",\n")}\n      }`;
}

function renderSynonym(synonym: SynonymAlias): string {
  const note = synonym.note === undefined ? "" : `, "note": ${quoted(synonym.note)}`;
  return `        { "alias": ${quoted(synonym.alias)}${note} }`;
}

function renderSynonyms(synonyms: readonly SynonymAlias[]): string {
  return `[\n${synonyms.map(renderSynonym).join(",\n")}\n      ]`;
}

/** Term fields in fixed order; every human-curated field is omitted while it is still empty. */
function termFields(term: GlossaryTerm): string[] {
  const fields = [
    `"term": ${quoted(term.term)}`,
    `"context": ${quoted(term.context)}`,
    `"kind": ${quoted(term.kind)}`,
    `"status": ${quoted(term.status)}`,
  ];
  if (term.definition !== undefined) fields.push(`"definition": ${quoted(term.definition)}`);
  if (term.translations.size > 0) {
    fields.push(`"translations": ${renderTranslations(term.translations)}`);
  }
  if (term.synonyms.length > 0) fields.push(`"synonyms": ${renderSynonyms(term.synonyms)}`);
  if (term.sources.length > 0) fields.push(`"sources": ${inlineArray(term.sources)}`);
  fields.push(`"firstSeen": ${quoted(term.firstSeen)}`);
  return fields;
}

function renderTerms(glossary: Glossary): string {
  if (glossary.terms.length === 0) return "[]";
  const rendered = glossary.terms.map(
    (term) => `    {\n      ${termFields(term).join(",\n      ")}\n    }`,
  );
  return `[\n${rendered.join(",\n")}\n  ]`;
}

/**
 * Serializes a glossary to its canonical JSON text.
 *
 * INTENT: the committed glossary must stay byte-identical whenever the vocabulary is unchanged
 * (anti-churn, ADR-012), so a test run that harvests nothing leaves a clean working tree. Every
 * ordering decision is made here: contexts sorted by name, terms in the `(context, term)` order
 * {@link glossary} already canonicalized, fixed key order, translation locales sorted, 2-space
 * indent, trailing newline.
 *
 * @param model the glossary to serialize.
 * @returns a deterministic JSON document ending in exactly one newline. Volatile statistics —
 * occurrence counts, last-seen dates, usage sites — are never emitted; they belong to run reports.
 * @remarks The `abbreviations` section is emitted only when it holds something; the schema version
 * that goes with it is already canonical on the model, decided by {@link glossary}. A glossary that
 * declares no shorthand therefore serializes exactly as it did before the section existed, which is
 * what keeps the merge-idempotence property honest for repositories that never adopt it.
 * @example
 * ```ts
 * writeFileSync("glossary.json", writeGlossaryJson(model), "utf-8");
 * ```
 */
export function writeGlossaryJson(model: Glossary): string {
  const sections = [
    "{",
    `  "schemaVersion": ${model.schemaVersion},`,
    `  "contexts": ${renderContexts(model)},`,
  ];
  if (model.abbreviations.size > 0) {
    sections.push(`  "abbreviations": ${renderAbbreviations(model)},`);
  }
  sections.push(`  "terms": ${renderTerms(model)}`, "}", "");
  return sections.join("\n");
}
