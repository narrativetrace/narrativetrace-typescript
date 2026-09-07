// SPDX-License-Identifier: BUSL-1.1
// Licensed under the Business Source License 1.1 (see LICENSE); Change Date: four years from publication; Change License: Apache-2.0
// Copyright (c) 2026 Empower Agile
import { describe, expect, test } from "vitest";
import {
  SCAFFOLDING_LOCALES,
  type ScaffoldingBundle,
  scaffoldingBundle,
} from "../src/scaffolding-bundle.js";

describe("scaffoldingBundle", () => {
  test("ships the renderer's own words for a locale it supports", () => {
    expect(scaffoldingBundle("es")).toMatchObject({
      locale: "es",
      callFlow: "Flujo de llamadas",
      incomplete: "incompleto",
    });
  });

  test("reads the base language's words for a regional locale", () => {
    expect(scaffoldingBundle("es-CL").locale).toBe("es");
  });

  test("ships Simplified Chinese under its regional tag, Java's words where Java has them", () => {
    expect(scaffoldingBundle("zh-CN")).toStrictEqual({
      locale: "zh-CN",
      callFlow: "调用流程",
      incomplete: "未完成",
      glossaryGaps: "术语表缺口",
      scenario: "场景",
    });
  });

  test("a Chinese tag the bundle does not carry falls back to English, not to zh-CN", () => {
    expect(scaffoldingBundle("zh").locale).toBe("en");
    expect(scaffoldingBundle("zh-TW").locale).toBe("en");
  });

  test("falls back to English, and says which locale it fell back to", () => {
    const bundle = scaffoldingBundle("ja");

    expect(bundle.locale).toBe("en");
    expect(bundle.incomplete).toBe("incomplete");
  });

  test("falls back for a locale tag that is empty or malformed", () => {
    expect(scaffoldingBundle("").locale).toBe("en");
    expect(scaffoldingBundle("-").locale).toBe("en");
    expect(scaffoldingBundle("ES").locale).toBe("en");
  });

  test("declares every locale it ships, and no locale it does not", () => {
    expect(SCAFFOLDING_LOCALES).toStrictEqual(["en", "es", "zh-CN"]);
  });

  test("every shipped locale defines every word the renderer scaffolds with", () => {
    const words: readonly (keyof ScaffoldingBundle)[] = [
      "callFlow",
      "incomplete",
      "glossaryGaps",
      "scenario",
    ];

    for (const locale of SCAFFOLDING_LOCALES) {
      const bundle = scaffoldingBundle(locale);

      expect(bundle.locale).toBe(locale);
      for (const word of words) {
        expect(bundle[word].trim()).not.toBe("");
      }
    }
  });
});
