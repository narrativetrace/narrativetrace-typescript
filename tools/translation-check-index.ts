// SPDX-License-Identifier: BUSL-1.1
// Licensed under the Business Source License 1.1 (see LICENSE); Change Date: four years from publication; Change License: Apache-2.0
// Copyright (c) 2026 Empower Agile
import { existsSync, readFileSync } from "node:fs";
import { basename } from "node:path";
import type { I18nLanguage, I18nManifest } from "./translation-check-manifest.js";

const ENGLISH_INDEX = "documentation/README.md";
const ROW_LINK = /\[[^\]]*]\(([^)]+)\)/g;

export function menuLine(text: string): string | undefined {
  const lines = text.split("\n");
  const h1 = lines.findIndex((l) => l.trimStart().startsWith("# "));
  if (h1 < 0) return undefined;
  return lines
    .slice(h1 + 1)
    .find((l) => l.trim() !== "")
    ?.trim();
}

function languageSegment(
  language: I18nLanguage,
  currentCode: string | undefined,
  indexExists: (path: string) => boolean,
): string {
  if (language.code === currentCode) return `**${language.displayName}**`;
  return indexExists(language.index)
    ? `[${language.displayName}](${basename(language.index)})`
    : language.displayName;
}

/** The expected `[English](README.md) | ...` menu line for a given manifest and current language. */
export function expectedMenu(
  manifest: I18nManifest,
  currentCode: string | undefined,
  indexExists: (path: string) => boolean,
): string {
  return [
    "[English](README.md)",
    ...manifest.languages.map((l) => languageSegment(l, currentCode, indexExists)),
  ].join(" | ");
}

function checkEnglishIndexMenu(manifest: I18nManifest): string[] {
  if (!existsSync(ENGLISH_INDEX)) {
    return [
      `${ENGLISH_INDEX}: missing — required unconditionally as the canonical documentation index`,
    ];
  }
  const actual = menuLine(readFileSync(ENGLISH_INDEX, "utf-8"));
  const expected = expectedMenu(manifest, undefined, existsSync);
  return actual === expected
    ? []
    : [`${ENGLISH_INDEX}: menu line is '${actual}', expected '${expected}'`];
}

/** Link targets found on every markdown-table row line in `text`. */
export function documentTargets(text: string): string[] {
  return text
    .split("\n")
    .filter((l) => l.trim().startsWith("|"))
    .flatMap((line) => [...line.matchAll(ROW_LINK)].map((m) => m[1] as string));
}

/** The `{languageDir}/{filename}` set a language's sibling index must list, one per translated document. */
export function expectedRows(language: I18nLanguage, manifest: I18nManifest): Set<string> {
  const dirName = basename(language.directory);
  return new Set(
    manifest.documents
      .filter((d) => language.code in d.translations)
      .map((d) => `${dirName}/${d.translations[language.code]}`),
  );
}

function checkDocumentRows(text: string, language: I18nLanguage, manifest: I18nManifest): string[] {
  const expected = expectedRows(language, manifest);
  const actual = new Set(documentTargets(text));
  const missing = [...expected].filter((e) => !actual.has(e));
  const orphaned = [...actual].filter((a) => !expected.has(a));
  return [
    ...missing.map((m) => `${language.index}: missing row for ${m}`),
    ...orphaned.map((o) => `${language.index}: orphaned row for ${o}`),
  ];
}

function checkLanguageIndex(language: I18nLanguage, manifest: I18nManifest): string[] {
  if (!existsSync(language.index)) {
    return language.status === "complete"
      ? [
          `${language.index}: missing — '${language.code}' is declared complete but has no sibling index`,
        ]
      : [];
  }
  const text = readFileSync(language.index, "utf-8");
  const actual = menuLine(text);
  const expected = expectedMenu(manifest, language.code, existsSync);
  const menuFailures =
    actual === expected
      ? []
      : [`${language.index}: menu line is '${actual}', expected '${expected}'`];
  return [...menuFailures, ...checkDocumentRows(text, language, manifest)];
}

/**
 * Index/menu integrity: the canonical English index and every language's sibling index.
 *
 * @remarks The English index is checked unconditionally. A missing sibling index is only a
 * failure for a `complete` language — an `in-progress` language simply has not launched one yet.
 */
export function checkAllIndex(manifest: I18nManifest): string[] {
  const failures = [
    ...checkEnglishIndexMenu(manifest),
    ...manifest.languages.flatMap((language) => checkLanguageIndex(language, manifest)),
  ];
  return failures.sort();
}
