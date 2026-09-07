// SPDX-License-Identifier: BUSL-1.1
// Licensed under the Business Source License 1.1 (see LICENSE); Change Date: four years from publication; Change License: Apache-2.0
// Copyright (c) 2026 Empower Agile
import { exportJson, type TraceTree } from "../packages/core/src/index.js";
import {
  readGlossaryJson,
  runTraceTranslation,
  SCAFFOLDING_LOCALES,
  type TranslatedFile,
} from "../packages/glossary/src/index.js";
import type { ExampleTree } from "./demo-registry.js";

/**
 * `--lang`: the run is recorded once, each captured tree goes through `exportJson`, and
 * `runTraceTranslation` re-derives it through the example's committed `glossary.json`. Values,
 * return values and error messages stay byte-identical; only glossary-covered identifiers change.
 */

export const SOURCE_LOCALE = "en";

/**
 * Locales the demo can offer for a glossary: English, then every locale at least one term carries
 * a translation for AND the library ships scaffolding words for — a locale with vocabulary but
 * English headings, or headings but no vocabulary, is not a demo.
 *
 * @throws whatever the strict reader throws for a malformed glossary — a committed file that does
 * not load must fail the run, not degrade to English.
 */
export function glossaryLocales(glossaryJson: string): string[] {
  const model = readGlossaryJson(glossaryJson);
  const carried = new Set<string>();
  for (const term of model.terms)
    for (const locale of term.translations.keys()) carried.add(locale);
  const offered = SCAFFOLDING_LOCALES.filter(
    (locale) => locale !== SOURCE_LOCALE && carried.has(locale),
  );
  return [SOURCE_LOCALE, ...offered];
}

/** One scenario's captured tree, keyed by the title the launcher printed for it. */
export interface CapturedTrace {
  readonly title: string;
  readonly tree: ExampleTree;
}

/**
 * Translates recorded scenarios into one locale; each result's `path` is the scenario title.
 *
 * @param sourcePrefix the example's source tree, which its glossary declares as the bounded
 * context's package — every class resolves there, so no scanner is needed for a demo.
 */
export function translateCaptured(
  glossaryJson: string,
  sourcePrefix: string,
  locale: string,
  captured: readonly CapturedTrace[],
): readonly TranslatedFile[] {
  // The tree was built by the example's copy of core — same shape, a second declaration of the
  // branded id types (see demo-registry.ts); exportJson only reads its data.
  const traces = captured.map(({ title, tree }) => ({
    path: title,
    json: exportJson(tree as TraceTree, { scenario: title }),
  }));
  return runTraceTranslation({
    glossaryJson,
    traces,
    locales: [locale],
    sourcePathOf: () => sourcePrefix,
  }).files;
}
