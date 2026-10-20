// SPDX-License-Identifier: BUSL-1.1
// Licensed under the Business Source License 1.1 (see LICENSE); Change Date: four years from publication; Change License: Apache-2.0
// Copyright (c) 2026 Empower Agile
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { resolveEnvConfig } from "../src/env-config.js";

const VARIABLE = "NARRATIVETRACE_EXCLUDE";

describe("resolveEnvConfig exclude", () => {
  test("carries the raw value when the key is set", () => {
    expect(resolveEnvConfig({ [VARIABLE]: "Reflector;acme.vendor" }).exclude).toBe(
      "Reflector;acme.vendor",
    );
  });

  test("keeps a present-but-empty value, because key presence states an empty list", () => {
    expect(resolveEnvConfig({ [VARIABLE]: "" })).toHaveProperty("exclude", "");
  });

  test("leaves the field out when the key is absent", () => {
    expect(resolveEnvConfig({})).not.toHaveProperty("exclude");
  });
});

describe("core-node exclude from the environment", () => {
  beforeEach(() => vi.resetModules());
  afterEach(async () => {
    vi.unstubAllEnvs();
    const { registerExcludeFromEnv } = await import("../src/index.js");
    registerExcludeFromEnv(undefined);
  });

  test("importing the package applies the variable, replacing the shipped default", async () => {
    vi.stubEnv(VARIABLE, "acme.vendor");
    const { effectiveExclude } = await import("../src/index.js");
    expect(effectiveExclude()).toEqual(["acme.vendor"]);
  });

  test("an empty variable states an empty list", async () => {
    vi.stubEnv(VARIABLE, "");
    const { effectiveExclude } = await import("../src/index.js");
    expect(effectiveExclude()).toEqual([]);
  });

  test("an absent variable leaves the shipped default", async () => {
    vi.stubEnv(VARIABLE, undefined);
    const { effectiveExclude, DEFAULT_EXCLUDE } = await import("../src/index.js");
    expect(effectiveExclude()).toEqual(DEFAULT_EXCLUDE);
  });
});
