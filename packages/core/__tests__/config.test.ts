// SPDX-License-Identifier: BUSL-1.1
// Licensed under the Business Source License 1.1 (see LICENSE); Change Date: four years from publication; Change License: Apache-2.0
// Copyright (c) 2026 Empower Agile
import { describe, expect, test } from "vitest";
import { NarrativeTraceConfig } from "../src/config.js";
import type { TracingLevel } from "../src/tracing-level.js";

describe("NarrativeTraceConfig", () => {
  test("defaults to detail", () => {
    const config = new NarrativeTraceConfig();
    expect(config.level).toBe("detail");
  });

  test("accepts explicit level in constructor", () => {
    const config = new NarrativeTraceConfig("errors");
    expect(config.level).toBe("errors");
  });

  test("level changeable at runtime", () => {
    const config = new NarrativeTraceConfig();
    config.level = "off";
    expect(config.level).toBe("off");
  });

  test("every valid level accepted by constructor", () => {
    const levels: readonly TracingLevel[] = ["off", "errors", "summary", "narrative", "detail"];
    for (const level of levels) {
      const config = new NarrativeTraceConfig(level);
      expect(config.level).toBe(level);
    }
  });

  test("setter accepts every valid level", () => {
    const config = new NarrativeTraceConfig();
    const levels: readonly TracingLevel[] = ["off", "errors", "summary", "narrative", "detail"];
    for (const level of levels) {
      config.level = level;
      expect(config.level).toBe(level);
    }
  });
});
