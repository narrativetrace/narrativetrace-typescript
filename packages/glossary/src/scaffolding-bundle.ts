// SPDX-License-Identifier: BUSL-1.1
// Licensed under the Business Source License 1.1 (see LICENSE); Change Date: four years from publication; Change License: Apache-2.0
// Copyright (c) 2026 Empower Agile
/**
 * The renderer's own words, in one locale.
 *
 * INTENT: a translated trace has two kinds of text — the repository's domain vocabulary, which
 * lives in its glossary, and the renderer's scaffolding, which is the same in every repository.
 * Scaffolding ships with the library so a project that curates no glossary at all still gets a
 * view whose headings and labels read in the target language.
 */
export interface ScaffoldingBundle {
  /** Locale these strings are written in — the fallback's tag, not the tag that was asked for. */
  readonly locale: string;
  /** Heading over the call flow. */
  readonly callFlow: string;
  /** Parenthesized label for a call that never completed. */
  readonly incomplete: string;
  /** Heading over the untranslated terms this file collected. */
  readonly glossaryGaps: string;
  /** Label introducing the scenario name. */
  readonly scenario: string;
}

/** Source locale of the product: every other bundle is a translation of this one. */
const EN: ScaffoldingBundle = Object.freeze({
  locale: "en",
  callFlow: "Call Flow",
  incomplete: "incomplete",
  glossaryGaps: "Glossary gaps",
  scenario: "Scenario",
});

const ES: ScaffoldingBundle = Object.freeze({
  locale: "es",
  callFlow: "Flujo de llamadas",
  incomplete: "incompleto",
  glossaryGaps: "Vacíos del glosario",
  scenario: "Escenario",
});

/**
 * Simplified Chinese, keyed by the regional tag Java ships (`scaffolding_zh_CN.properties`);
 * `incomplete` and `glossaryGaps` are Java's words, `scenario` is the i18n terminology's, and
 * `callFlow` has no Java counterpart (Java's renderer scaffolds different words).
 */
const ZH_CN: ScaffoldingBundle = Object.freeze({
  locale: "zh-CN",
  callFlow: "调用流程",
  incomplete: "未完成",
  glossaryGaps: "术语表缺口",
  scenario: "场景",
});

const BUNDLES: ReadonlyMap<string, ScaffoldingBundle> = new Map([
  [EN.locale, EN],
  [ES.locale, ES],
  [ZH_CN.locale, ZH_CN],
]);

/** Locale tags this library ships scaffolding for, in the order they were adopted. */
export const SCAFFOLDING_LOCALES: readonly string[] = Object.freeze([...BUNDLES.keys()]);

/**
 * Looks up the renderer's scaffolding for a locale.
 *
 * INTENT: the seam that keeps translation possible for locales the library does not ship words
 * for — a repository can curate its whole domain vocabulary in Japanese before anyone translates
 * the word "Scenario", and the vocabulary is the part that carries the meaning.
 *
 * @param locale target locale tag; a region subtag falls back to its base language (`es-CL` reads
 * the `es` bundle).
 * @returns the bundle for `locale`, else its base language's, else the English source bundle. The
 * returned `locale` field says which was used, so a caller can report the substitution rather than
 * present English scaffolding as if it were the requested language.
 * @example
 * ```ts
 * scaffoldingBundle("es").incomplete; // "incompleto"
 * scaffoldingBundle("ja").locale; // "en"
 * ```
 */
export function scaffoldingBundle(locale: string): ScaffoldingBundle {
  const base = locale.split("-")[0] ?? locale;
  return BUNDLES.get(locale) ?? BUNDLES.get(base) ?? EN;
}
