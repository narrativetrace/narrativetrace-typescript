// SPDX-License-Identifier: BUSL-1.1
// Licensed under the Business Source License 1.1 (see LICENSE); Change Date: four years from publication; Change License: Apache-2.0
// Copyright (c) 2026 Empower Agile
import { readFileSync } from "node:fs";
import { parseHeader, translatedFiles } from "./translation-check-discovery.js";
import type { I18nLanguage, I18nManifest } from "./translation-check-manifest.js";

function isUnreviewed(path: string): boolean {
  const header = parseHeader(readFileSync(path, "utf-8").split("\n")[0] ?? "");
  return header !== undefined && header.reviewed === undefined;
}

/** Every translated file whose header has no `| reviewed: <date>` clause. */
export function unreviewedFiles(): string[] {
  return translatedFiles().filter(isUnreviewed);
}

/** The one line `translation-check` always prints — warn-only, never gates the build. */
export function reviewSummaryLine(): string {
  const count = unreviewedFiles().length;
  return `translation-check: ${count} translated document(s) unreviewed (run 'pnpm run translation-status' for the full list)`;
}

function languageLine(language: I18nLanguage, manifest: I18nManifest): string {
  const total = manifest.documents.length;
  const translated = manifest.documents.filter((d) => language.code in d.translations).length;
  const unreviewed = unreviewedFiles().filter((p) => p.startsWith(`${language.directory}/`)).length;
  return `  ${language.code} (${language.status}): ${translated}/${total} translated, ${unreviewed} unreviewed`;
}

/** The full per-language coverage-and-review matrix — the human dashboard, never wired into `check`. */
export function statusReport(manifest: I18nManifest | undefined): string {
  if (!manifest) return "translation-status: no manifest at documentation/i18n/manifest.json";
  return ["translation-status:", ...manifest.languages.map((l) => languageLine(l, manifest))].join(
    "\n",
  );
}
