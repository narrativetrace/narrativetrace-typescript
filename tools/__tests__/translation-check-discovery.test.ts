// SPDX-License-Identifier: BUSL-1.1
// Licensed under the Business Source License 1.1 (see LICENSE); Change Date: four years from publication; Change License: Apache-2.0
// Copyright (c) 2026 Empower Agile
import { describe, expect, it } from "vitest";
import { gitBlobHash12, isLanguageDirFile, parseHeader } from "../translation-check-discovery.js";

describe("gitBlobHash12", () => {
  it("matches git's own blob hash for known content", () => {
    // Verified against `printf 'hello\n' | git hash-object --stdin`.
    expect(gitBlobHash12("hello\n")).toBe("ce013625030b");
  });

  it("hashes empty content the same as git's empty blob", () => {
    expect(gitBlobHash12("")).toBe("e69de29bb2d1");
  });

  it("produces different hashes for different content", () => {
    expect(gitBlobHash12("a")).not.toBe(gitBlobHash12("b"));
  });
});

describe("parseHeader", () => {
  it("parses a header with no reviewed clause", () => {
    const header = parseHeader(
      "<!-- source: documentation/installation-guide.md blob 1a2b3c4d5e6f | translated: 2026-08-13 -->",
    );
    expect(header).toEqual({
      sourcePath: "documentation/installation-guide.md",
      blobHashPrefix: "1a2b3c4d5e6f",
      reviewed: undefined,
    });
  });

  it("parses a header with a reviewed date", () => {
    const header = parseHeader(
      "<!-- source: documentation/installation-guide.md blob 1a2b3c4d5e6f | translated: 2026-08-13 | reviewed: 2026-09-01 -->",
    );
    expect(header?.reviewed).toBe("2026-09-01");
  });

  it("treats the '-' reviewed sentinel as unreviewed", () => {
    const header = parseHeader(
      "<!-- source: documentation/installation-guide.md blob 1a2b3c4d5e6f | translated: 2026-08-13 | reviewed: - -->",
    );
    expect(header?.reviewed).toBeUndefined();
  });

  it("tolerates surrounding whitespace", () => {
    const header = parseHeader(
      "  <!-- source: a.md blob 000000000000 | translated: 2026-01-01 -->  \n",
    );
    expect(header?.sourcePath).toBe("a.md");
  });

  it("rejects a line with no header at all", () => {
    expect(parseHeader("# Some Title")).toBeUndefined();
  });

  it("rejects a hash shorter than 12 hex characters", () => {
    expect(
      parseHeader("<!-- source: a.md blob abc123 | translated: 2026-01-01 -->"),
    ).toBeUndefined();
  });

  it("rejects a malformed date", () => {
    expect(
      parseHeader("<!-- source: a.md blob 000000000000 | translated: 2026-1-1 -->"),
    ).toBeUndefined();
  });
});

describe("isLanguageDirFile", () => {
  it("matches a file under a two-letter language directory", () => {
    expect(isLanguageDirFile("documentation/es/guia-de-instalacion.md")).toBe(true);
  });

  it("matches a file under a hyphenated language directory", () => {
    expect(isLanguageDirFile("documentation/pt-BR/guia-de-instalacao.md")).toBe(true);
  });

  it("excludes the i18n manifest directory", () => {
    expect(isLanguageDirFile("documentation/i18n/manifest.json")).toBe(false);
  });

  it("excludes files directly under documentation/ with no subdirectory", () => {
    expect(isLanguageDirFile("documentation/README.md")).toBe(false);
  });

  it("rejects a sibling directory sharing the 'documentation' prefix without a path delimiter", () => {
    expect(isLanguageDirFile("documentationx/es/guide.md")).toBe(false);
  });

  it("excludes files outside documentation/ entirely", () => {
    expect(isLanguageDirFile("packages/skills/README.md")).toBe(false);
  });
});
