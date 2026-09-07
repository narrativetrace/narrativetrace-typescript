// SPDX-License-Identifier: BUSL-1.1
// Licensed under the Business Source License 1.1 (see LICENSE); Change Date: four years from publication; Change License: Apache-2.0
// Copyright (c) 2026 Empower Agile
import { existsSync, readFileSync } from "node:fs";

export const MANIFEST_PATH = "documentation/i18n/manifest.json";

export type I18nStatus = "complete" | "in-progress";

export interface I18nLanguage {
  readonly code: string;
  readonly displayName: string;
  readonly directory: string;
  readonly index: string;
  readonly rootReadme: string;
  readonly status: I18nStatus;
}

export interface I18nDocument {
  readonly source: string;
  readonly translations: Readonly<Record<string, string>>;
}

export interface I18nManifest {
  readonly sourceLanguage: string;
  readonly languages: readonly I18nLanguage[];
  readonly documents: readonly I18nDocument[];
}

function parseStatus(value: unknown, code: string): I18nStatus {
  if (value === "complete" || value === "in-progress") return value;
  throw new Error(`manifest: language '${code}' has invalid status '${String(value)}'`);
}

function parseLanguage(raw: Record<string, unknown>): I18nLanguage {
  const code = String(raw.code);
  return {
    code,
    displayName: String(raw.displayName),
    directory: String(raw.directory),
    index: String(raw.index),
    rootReadme: String(raw.rootReadme),
    status: parseStatus(raw.status, code),
  };
}

function parseDocument(raw: {
  source: string;
  translations?: Record<string, string>;
}): I18nDocument {
  return { source: raw.source, translations: raw.translations ?? {} };
}

/** @throws {Error} when a declared language's `status` is neither `"complete"` nor `"in-progress"`. */
export function parseManifest(json: unknown): I18nManifest {
  const raw = json as {
    sourceLanguage: string;
    languages: Record<string, unknown>[];
    documents: { source: string; translations?: Record<string, string> }[];
  };
  return {
    sourceLanguage: raw.sourceLanguage,
    languages: raw.languages.map(parseLanguage),
    documents: raw.documents.map(parseDocument),
  };
}

/**
 * Loads the i18n manifest, or `undefined` when it is simply absent.
 *
 * @throws {Error} when the file exists but is malformed — a broken manifest fails loudly rather
 * than degrading silently, unlike a missing one.
 */
export function loadManifestOrUndefined(): I18nManifest | undefined {
  if (!existsSync(MANIFEST_PATH)) return undefined;
  return parseManifest(JSON.parse(readFileSync(MANIFEST_PATH, "utf-8")));
}
