// SPDX-License-Identifier: BUSL-1.1
// Licensed under the Business Source License 1.1 (see LICENSE); Change Date: four years from publication; Change License: Apache-2.0
// Copyright (c) 2026 Empower Agile
import { describe, expect, test } from "vitest";
import { DEMO_USAGE, parseDemoArgs } from "../demo-args.js";

describe("parseDemoArgs", () => {
  test("no arguments means the interactive defaults", () => {
    expect(parseDemoArgs([])).toStrictEqual({
      ok: true,
      args: { list: false, classic: false, noPause: false, help: false },
    });
  });

  test("reads every flag, in both spaced and = forms, and the short example alias", () => {
    const spaced = parseDemoArgs([
      "--example",
      "ecommerce",
      "--lang",
      "es",
      "--classic",
      "--no-pause",
    ]);
    const joined = parseDemoArgs(["-e", "clarity", "--lang=zh-CN", "--list", "--help"]);
    expect(spaced).toStrictEqual({
      ok: true,
      args: {
        example: "ecommerce",
        lang: "es",
        list: false,
        classic: true,
        noPause: true,
        help: false,
      },
    });
    expect(joined).toStrictEqual({
      ok: true,
      args: {
        example: "clarity",
        lang: "zh-CN",
        list: true,
        classic: false,
        noPause: false,
        help: true,
      },
    });
  });

  test("a value flag without a value, or followed by another flag, is a usage error", () => {
    expect(parseDemoArgs(["--example"])).toStrictEqual({
      ok: false,
      error: "--example needs a value",
    });
    expect(parseDemoArgs(["--lang", "--classic"])).toStrictEqual({
      ok: false,
      error: "--lang needs a value",
    });
    expect(parseDemoArgs(["--example="])).toStrictEqual({
      ok: false,
      error: "--example needs a value",
    });
  });

  test("an unknown option or a stray positional is a usage error naming it", () => {
    expect(parseDemoArgs(["--colour"])).toStrictEqual({
      ok: false,
      error: "unknown option: --colour",
    });
    expect(parseDemoArgs(["ecommerce"])).toStrictEqual({
      ok: false,
      error: "unknown option: ecommerce",
    });
  });

  test("a bare -- separator (what pnpm forwards) is skipped and the last value wins", () => {
    expect(parseDemoArgs(["--", "--example", "a", "--example", "b"])).toStrictEqual({
      ok: true,
      args: { example: "b", list: false, classic: false, noPause: false, help: false },
    });
  });

  test("the usage text names every flag", () => {
    for (const flag of ["--example", "--list", "--classic", "--no-pause", "--lang", "--help"]) {
      expect(DEMO_USAGE).toContain(flag);
    }
  });
});
