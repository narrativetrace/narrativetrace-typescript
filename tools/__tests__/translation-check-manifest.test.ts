// SPDX-License-Identifier: BUSL-1.1
// Licensed under the Business Source License 1.1 (see LICENSE); Change Date: four years from publication; Change License: Apache-2.0
// Copyright (c) 2026 Empower Agile
import { describe, expect, it } from "vitest";
import { parseManifest } from "../translation-check-manifest.js";

const VALID = {
  sourceLanguage: "en",
  languages: [
    {
      code: "es",
      displayName: "Español",
      directory: "documentation/es",
      index: "documentation/LEAME.md",
      rootReadme: "LEAME.md",
      status: "in-progress",
    },
  ],
  documents: [
    { source: "documentation/first-10-minutes.md", translations: { es: "primeros-10-minutos.md" } },
    { source: "documentation/maven-guide.md" },
  ],
};

describe("parseManifest", () => {
  it("parses a well-formed manifest", () => {
    const manifest = parseManifest(VALID);
    expect(manifest.sourceLanguage).toBe("en");
    expect(manifest.languages).toHaveLength(1);
    expect(manifest.languages[0]?.status).toBe("in-progress");
  });

  it("defaults a document's translations to an empty object when the key is absent", () => {
    const manifest = parseManifest(VALID);
    expect(manifest.documents[1]?.translations).toEqual({});
  });

  it("preserves a document's declared translations map", () => {
    const manifest = parseManifest(VALID);
    expect(manifest.documents[0]?.translations).toEqual({ es: "primeros-10-minutos.md" });
  });

  it("accepts the 'complete' status", () => {
    const manifest = parseManifest({
      ...VALID,
      languages: [{ ...VALID.languages[0], status: "complete" }],
    });
    expect(manifest.languages[0]?.status).toBe("complete");
  });

  it("throws on an invalid status value", () => {
    expect(() =>
      parseManifest({ ...VALID, languages: [{ ...VALID.languages[0], status: "done" }] }),
    ).toThrow(/invalid status/);
  });

  it("names the offending language code in the status error", () => {
    expect(() =>
      parseManifest({
        ...VALID,
        languages: [{ ...VALID.languages[0], code: "fr", status: "done" }],
      }),
    ).toThrow(/'fr'/);
  });
});
