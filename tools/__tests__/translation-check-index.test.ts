// SPDX-License-Identifier: BUSL-1.1
// Licensed under the Business Source License 1.1 (see LICENSE); Change Date: four years from publication; Change License: Apache-2.0
// Copyright (c) 2026 Empower Agile
import { describe, expect, it } from "vitest";
import {
  documentTargets,
  expectedMenu,
  expectedRows,
  menuLine,
} from "../translation-check-index.js";
import type { I18nLanguage, I18nManifest } from "../translation-check-manifest.js";

const es: I18nLanguage = {
  code: "es",
  displayName: "Español",
  directory: "documentation/es",
  index: "documentation/LEAME.md",
  rootReadme: "LEAME.md",
  status: "in-progress",
};

const zhCN: I18nLanguage = {
  code: "zh-CN",
  displayName: "简体中文",
  directory: "documentation/zh-CN",
  index: "documentation/自述文件.md",
  rootReadme: "自述文件.md",
  status: "in-progress",
};

const manifest: I18nManifest = {
  sourceLanguage: "en",
  languages: [es, zhCN],
  documents: [
    { source: "documentation/a.md", translations: { es: "a-es.md" } },
    { source: "documentation/b.md", translations: {} },
  ],
};

describe("menuLine", () => {
  it("returns the first non-blank line after the H1", () => {
    expect(menuLine("# Title\n\nMenu line\n\nBody\n")).toBe("Menu line");
  });

  it("skips multiple blank lines", () => {
    expect(menuLine("# Title\n\n\n\nMenu line\n")).toBe("Menu line");
  });

  it("returns undefined when there is no H1", () => {
    expect(menuLine("Just prose\n\nMore prose\n")).toBeUndefined();
  });

  it("trims surrounding whitespace from the menu line", () => {
    expect(menuLine("# Title\n  Menu line  \n")).toBe("Menu line");
  });
});

describe("expectedMenu", () => {
  it("always links English, even from English's own index", () => {
    expect(expectedMenu(manifest, undefined, () => false)).toBe(
      "[English](README.md) | Español | 简体中文",
    );
  });

  it("bolds the current language and links the others when their index exists", () => {
    expect(expectedMenu(manifest, "es", () => true)).toBe(
      "[English](README.md) | **Español** | [简体中文](自述文件.md)",
    );
  });

  it("renders a language with no sibling index yet as plain text", () => {
    expect(expectedMenu(manifest, "es", () => false)).toBe(
      "[English](README.md) | **Español** | 简体中文",
    );
  });
});

describe("documentTargets", () => {
  it("collects link targets from table row lines", () => {
    const text = "| Guide |\n|---|\n| [A](es/a-es.md) |\n| [B](es/b-es.md) |\n";
    expect(documentTargets(text)).toEqual(["es/a-es.md", "es/b-es.md"]);
  });

  it("ignores links outside table rows", () => {
    const text = "[Not a row](outside.md)\n\n| Guide |\n|---|\n| [A](es/a-es.md) |\n";
    expect(documentTargets(text)).toEqual(["es/a-es.md"]);
  });

  it("returns an empty array when there are no table rows", () => {
    expect(documentTargets("just prose\n")).toEqual([]);
  });
});

describe("expectedRows", () => {
  it("includes only documents translated for the language", () => {
    expect(expectedRows(es, manifest)).toEqual(new Set(["es/a-es.md"]));
  });

  it("is empty when the language has translated nothing", () => {
    expect(expectedRows(zhCN, manifest)).toEqual(new Set());
  });
});
