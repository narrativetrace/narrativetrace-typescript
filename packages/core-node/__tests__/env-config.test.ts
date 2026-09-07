// SPDX-License-Identifier: BUSL-1.1
// Licensed under the Business Source License 1.1 (see LICENSE); Change Date: four years from publication; Change License: Apache-2.0
// Copyright (c) 2026 Empower Agile
import { describe, expect, test } from "vitest";
import { resolveEnvConfig } from "../src/env-config.js";

describe("resolveEnvConfig", () => {
  test("reads level, output, outputDir and format", () => {
    expect(
      resolveEnvConfig({
        NARRATIVETRACE_LEVEL: "summary",
        NARRATIVETRACE_OUTPUT: "console",
        NARRATIVETRACE_OUTPUT_DIR: "/tmp/traces",
        NARRATIVETRACE_FORMAT: "markdown",
      }),
    ).toEqual({
      level: "summary",
      output: "console",
      outputDir: "/tmp/traces",
      format: "markdown",
    });
  });

  test("defaults the level to the fallback when unset", () => {
    expect(resolveEnvConfig({}, "narrative")).toEqual({ level: "narrative" });
  });

  test("degrades a garbage level to the fallback without throwing", () => {
    expect(resolveEnvConfig({ NARRATIVETRACE_LEVEL: "loud" }, "detail").level).toBe("detail");
  });

  test("parses the level case-insensitively", () => {
    expect(resolveEnvConfig({ NARRATIVETRACE_LEVEL: "OFF" }).level).toBe("off");
  });

  test("omits optional keys that are absent or empty", () => {
    const config = resolveEnvConfig({ NARRATIVETRACE_OUTPUT: "" });
    expect(config.output).toBeUndefined();
    expect(config.outputDir).toBeUndefined();
    expect(config.format).toBeUndefined();
  });
});
