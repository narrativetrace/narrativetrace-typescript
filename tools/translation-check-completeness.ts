// SPDX-License-Identifier: BUSL-1.1
// Licensed under the Business Source License 1.1 (see LICENSE); Change Date: four years from publication; Change License: Apache-2.0
// Copyright (c) 2026 Empower Agile
import { existsSync } from "node:fs";
import { join } from "node:path";
import type { I18nLanguage, I18nManifest } from "./translation-check-manifest.js";

export interface CompletenessResult {
  readonly failures: string[];
  readonly warnings: string[];
}

/** Manifest documents with no translation entry at all for `language`. */
export function missingFor(language: I18nLanguage, manifest: I18nManifest): string[] {
  return manifest.documents.filter((d) => !(language.code in d.translations)).map((d) => d.source);
}

/** Documents the manifest declares translated for `language` whose file does not exist on disk. */
export function declaredButAbsent(
  language: I18nLanguage,
  manifest: I18nManifest,
  exists: (path: string) => boolean,
): string[] {
  return manifest.documents.flatMap((doc) => {
    const filename = doc.translations[language.code];
    if (!filename) return [];
    const path = join(language.directory, filename);
    if (exists(path)) return [];
    return [
      `${language.code}: manifest declares '${path}' for ${doc.source} but the file does not exist`,
    ];
  });
}

function checkLanguage(
  language: I18nLanguage,
  manifest: I18nManifest,
  exists: (path: string) => boolean,
): CompletenessResult {
  const failures = declaredButAbsent(language, manifest, exists);
  const missing = missingFor(language, manifest);
  if (missing.length === 0) return { failures, warnings: [] };
  const message = `${language.code} (${language.status}): missing translation of ${missing.join(", ")}`;
  return language.status === "complete"
    ? { failures: [...failures, message], warnings: [] }
    : { failures, warnings: [message] };
}

/**
 * Verifies every manifest document is translated for every manifest language.
 *
 * @returns a gap in a `complete` language as a failure, the same gap in an `in-progress` language
 * as a warning, and a manifest entry naming a file that does not exist on disk as an unconditional
 * failure regardless of status — that is not an incomplete translation, it is the manifest lying.
 */
export function checkCompleteness(
  manifest: I18nManifest,
  exists: (path: string) => boolean = existsSync,
): CompletenessResult {
  const results = manifest.languages.map((language) => checkLanguage(language, manifest, exists));
  return {
    failures: results.flatMap((r) => r.failures).sort(),
    warnings: results.flatMap((r) => r.warnings).sort(),
  };
}
