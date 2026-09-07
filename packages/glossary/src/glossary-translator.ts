// SPDX-License-Identifier: BUSL-1.1
// Licensed under the Business Source License 1.1 (see LICENSE); Change Date: four years from publication; Change License: Apache-2.0
// Copyright (c) 2026 Empower Agile
import type { Glossary } from "./glossary.js";
import { termKey } from "./term-key.js";

/**
 * One phrase's translation attempt: the text to render, and whether the glossary knew it.
 *
 * INTENT: the gaps footer is the work queue that drives glossary completion, so a caller must be
 * able to tell a real translation from a phrase that fell through untranslated — the rendered text
 * alone cannot say, since an untranslated phrase renders as itself.
 */
export interface TranslatedPhrase {
  /** Text to render: the translation, or the original phrase when none was found. */
  readonly text: string;
  /** Whether the glossary supplied the text. */
  readonly translated: boolean;
}

/** Translates normalized phrases into one locale, within a bounded context. */
export interface GlossaryTranslator {
  /**
   * Translates one normalized phrase.
   *
   * @param context bounded context the phrase was observed in.
   * @param phrase the phrase, in the normalized form {@link normalizePhrase} produces — lookup is
   * exact, so an identifier that was not normalized first will not match.
   * @returns the translation, or the phrase itself marked untranslated.
   */
  readonly translate: (context: string, phrase: string) => TranslatedPhrase;
}

/**
 * Indexes a glossary's translations for one locale.
 *
 * INTENT: the one place "what does this phrase say in this locale here?" is answered, so the
 * translated trace view never reaches into term records itself. Scoping is per context by
 * construction — the same term may translate differently in two contexts, which is the point of
 * bounding and the reason context improves translation quality.
 *
 * @param model the glossary whose curated terms carry the translations.
 * @param locale target locale tag, matched exactly against the keys of `term.translations`.
 * @returns a translator over every term that has a translation for `locale`; a glossary with none
 * yields a translator that reports every phrase untranslated.
 * @llmNote The lookup chain is the plan's: exact phrase entry, then per-token word entries, then
 * untranslated. The word-level step is all-or-nothing on purpose — a phrase whose words are only
 * partly known stays untranslated, so it appears in the gaps footer. Splicing the known words in
 * would produce a half-translated phrase that reads as finished work and hides the missing word
 * from the queue that drives curation.
 * @example
 * ```ts
 * glossaryTranslator(model, "es").translate("billing", "insufficient fund");
 * // { text: "fondos insuficientes", translated: true }
 * ```
 */
/** Every term that has a translation for this locale, keyed by `(context, term)`. */
function translationsFor(model: Glossary, locale: string): Map<string, string> {
  const byTerm = new Map<string, string>();
  for (const term of model.terms) {
    const translation = term.translations.get(locale);
    // The guard is an equivalent mutant by construction, not a test gap: filing a term with an
    // `undefined` translation would make `get` answer `undefined`, which is exactly what an absent
    // key answers, and every lookup below branches on that same value.
    if (translation !== undefined) byTerm.set(termKey(term.context, term.term), translation);
  }
  return byTerm;
}

export function glossaryTranslator(model: Glossary, locale: string): GlossaryTranslator {
  const byTerm = translationsFor(model, locale);
  const wordwise = (context: string, phrase: string): string | undefined => {
    const words = phrase.split(" ").map((word) => byTerm.get(termKey(context, word)));
    return words.every((word) => word !== undefined) ? words.join(" ") : undefined;
  };
  return Object.freeze({
    translate: (context: string, phrase: string): TranslatedPhrase => {
      const found = byTerm.get(termKey(context, phrase)) ?? wordwise(context, phrase);
      return found === undefined
        ? { text: phrase, translated: false }
        : { text: found, translated: true };
    },
  });
}
