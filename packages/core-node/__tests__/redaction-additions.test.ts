// SPDX-License-Identifier: BUSL-1.1
// Licensed under the Business Source License 1.1 (see LICENSE); Change Date: four years from publication; Change License: Apache-2.0
// Copyright (c) 2026 Empower Agile
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";

const VARIABLE = "NARRATIVETRACE_REDACTION_ADDITIONALPATTERNS";

describe("core-node redaction additions from the environment", () => {
  beforeEach(() => vi.resetModules());
  afterEach(async () => {
    vi.unstubAllEnvs();
    const { registerAdditionalRedactionPatterns } = await import("../src/index.js");
    registerAdditionalRedactionPatterns(undefined);
  });

  test("importing the package applies the variable to the default policy", async () => {
    vi.stubEnv(VARIABLE, "betalingskort");
    const { RedactionPolicy } = await import("../src/index.js");
    expect(RedactionPolicy.DEFAULT.shouldRedact("betalingskort")).toBe(true);
    expect(RedactionPolicy.DEFAULT.shouldRedact("password")).toBe(true);
  });

  test("an unset variable changes nothing", async () => {
    vi.stubEnv(VARIABLE, "");
    const { RedactionPolicy } = await import("../src/index.js");
    expect(RedactionPolicy.DEFAULT.shouldRedact("betalingskort")).toBe(false);
  });
});
