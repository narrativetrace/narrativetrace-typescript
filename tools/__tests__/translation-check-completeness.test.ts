// SPDX-License-Identifier: BUSL-1.1
// Licensed under the Business Source License 1.1 (see LICENSE); Change Date: four years from publication; Change License: Apache-2.0
// Copyright (c) 2026 Empower Agile
import { describe, expect, it } from "vitest";
import {
  checkCompleteness,
  declaredButAbsent,
  missingFor,
} from "../translation-check-completeness.js";
import type { I18nLanguage, I18nManifest } from "../translation-check-manifest.js";

const esInProgress: I18nLanguage = {
  code: "es",
  displayName: "Español",
  directory: "documentation/es",
  index: "documentation/LEAME.md",
  rootReadme: "LEAME.md",
  status: "in-progress",
};

const manifest: I18nManifest = {
  sourceLanguage: "en",
  languages: [esInProgress],
  documents: [
    { source: "documentation/a.md", translations: {} },
    { source: "documentation/b.md", translations: { es: "b-es.md" } },
  ],
};

describe("missingFor", () => {
  it("lists documents with no translation entry for the language", () => {
    expect(missingFor(esInProgress, manifest)).toEqual(["documentation/a.md"]);
  });

  it("returns nothing when every document has an entry", () => {
    const complete: I18nManifest = {
      ...manifest,
      documents: [manifest.documents[1] as I18nManifest["documents"][number]],
    };
    expect(missingFor(esInProgress, complete)).toEqual([]);
  });
});

describe("declaredButAbsent", () => {
  it("flags a declared translation whose file does not exist", () => {
    const failures = declaredButAbsent(esInProgress, manifest, () => false);
    expect(failures).toEqual([
      "es: manifest declares 'documentation/es/b-es.md' for documentation/b.md but the file does not exist",
    ]);
  });

  it("passes when the declared file exists", () => {
    expect(declaredButAbsent(esInProgress, manifest, () => true)).toEqual([]);
  });

  it("ignores documents the language has no translation entry for", () => {
    const onlyMissing: I18nManifest = {
      ...manifest,
      documents: [manifest.documents[0] as I18nManifest["documents"][number]],
    };
    expect(declaredButAbsent(esInProgress, onlyMissing, () => false)).toEqual([]);
  });
});

describe("checkCompleteness", () => {
  it("warns, not fails, for an in-progress language's gaps", () => {
    const result = checkCompleteness(manifest, () => true);
    expect(result.failures).toEqual([]);
    expect(result.warnings).toEqual([
      "es (in-progress): missing translation of documentation/a.md",
    ]);
  });

  it("fails for a complete language's gaps", () => {
    const complete: I18nManifest = {
      ...manifest,
      languages: [{ ...esInProgress, status: "complete" }],
    };
    const result = checkCompleteness(complete, () => true);
    expect(result.warnings).toEqual([]);
    expect(result.failures).toEqual(["es (complete): missing translation of documentation/a.md"]);
  });

  it("fails on a declared-but-absent file regardless of status", () => {
    const result = checkCompleteness(manifest, () => false);
    expect(result.failures).toContainEqual(expect.stringContaining("does not exist"));
  });

  it("reports nothing for a manifest with no languages", () => {
    const result = checkCompleteness({ ...manifest, languages: [] }, () => true);
    expect(result).toEqual({ failures: [], warnings: [] });
  });
});
