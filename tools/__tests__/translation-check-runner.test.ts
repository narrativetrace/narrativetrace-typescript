// SPDX-License-Identifier: BUSL-1.1
// Licensed under the Business Source License 1.1 (see LICENSE); Change Date: four years from publication; Change License: Apache-2.0
// Copyright (c) 2026 Empower Agile
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { gitBlobHash12 } from "../translation-check-discovery.js";
import { runTranslationCheck } from "../translation-check-runner.js";

let root: string;
let originalCwd: string;

function write(relativePath: string, content: string): void {
  const path = join(root, relativePath);
  mkdirSync(join(path, ".."), { recursive: true });
  writeFileSync(path, content);
}

const SOURCE = "# First 10 Minutes\n\nSeven steps.\n";

function seedRepo(): void {
  write("documentation/first-10-minutes.md", SOURCE);
  write(
    "documentation/i18n/manifest.json",
    JSON.stringify({
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
        {
          source: "documentation/first-10-minutes.md",
          translations: { es: "primeros-10-minutos.md" },
        },
      ],
    }),
  );
  write(
    "documentation/README.md",
    "# NarrativeTrace documentation\n\n[English](README.md) | Español\n",
  );
  write(
    "documentation/es/primeros-10-minutos.md",
    `<!-- source: documentation/first-10-minutes.md blob ${gitBlobHash12(SOURCE)} | translated: 2026-09-03 -->\n# Los Primeros 10 Minutos\n\nSiete pasos.\n`,
  );
}

beforeEach(() => {
  originalCwd = process.cwd();
  root = mkdtempSync(join(tmpdir(), "translation-check-test-"));
  process.chdir(root);
});

afterEach(() => {
  process.chdir(originalCwd);
  rmSync(root, { recursive: true, force: true });
});

describe("runTranslationCheck", () => {
  it("degrades to the staleness-only check with one warning when no manifest exists", () => {
    write("documentation/first-10-minutes.md", SOURCE);
    const result = runTranslationCheck();
    expect(result.failures).toEqual([]);
    expect(result.warnings).toEqual([
      "translation-check: no manifest at documentation/i18n/manifest.json — ran the staleness-only check",
    ]);
  });

  it("passes cleanly on a fully consistent repo", () => {
    seedRepo();
    const result = runTranslationCheck();
    expect(result.failures).toEqual([]);
  });

  it("fails staleness when the English source changes without restamping the translation", () => {
    seedRepo();
    write("documentation/first-10-minutes.md", `${SOURCE}\nOne more paragraph.\n`);
    const result = runTranslationCheck();
    expect(result.failures.some((f) => f.includes("stale"))).toBe(true);
  });

  it("fails on a language-directory file with a missing header", () => {
    seedRepo();
    write("documentation/es/otro.md", "# Sin encabezado\n");
    const result = runTranslationCheck();
    expect(result.failures.some((f) => f.includes("missing or malformed translation header"))).toBe(
      true,
    );
  });

  it("fails structure parity when a translation drops a heading", () => {
    seedRepo();
    write(
      "documentation/es/primeros-10-minutos.md",
      `<!-- source: documentation/first-10-minutes.md blob ${gitBlobHash12(SOURCE)} | translated: 2026-09-03 -->\nSin título.\n`,
    );
    const result = runTranslationCheck();
    expect(result.failures.some((f) => f.includes("heading count differs"))).toBe(true);
  });

  it("warns (not fails) the missing translation for an in-progress language with a real gap", () => {
    seedRepo();
    write(
      "documentation/i18n/manifest.json",
      JSON.stringify({
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
          {
            source: "documentation/first-10-minutes.md",
            translations: { es: "primeros-10-minutos.md" },
          },
          { source: "documentation/installation-guide.md", translations: {} },
        ],
      }),
    );
    const result = runTranslationCheck();
    expect(result.failures).toEqual([]);
    expect(result.warnings.some((w) => w.includes("installation-guide.md"))).toBe(true);
  });

  it("fails completeness for a complete language's gap instead of warning", () => {
    seedRepo();
    write(
      "documentation/i18n/manifest.json",
      JSON.stringify({
        sourceLanguage: "en",
        languages: [
          {
            code: "es",
            displayName: "Español",
            directory: "documentation/es",
            index: "documentation/LEAME.md",
            rootReadme: "LEAME.md",
            status: "complete",
          },
        ],
        documents: [
          {
            source: "documentation/first-10-minutes.md",
            translations: { es: "primeros-10-minutos.md" },
          },
          { source: "documentation/installation-guide.md", translations: {} },
        ],
      }),
    );
    const result = runTranslationCheck();
    expect(result.failures.some((f) => f.includes("installation-guide.md"))).toBe(true);
  });
});
