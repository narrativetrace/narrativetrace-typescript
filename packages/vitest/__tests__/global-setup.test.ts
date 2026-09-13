// SPDX-License-Identifier: BUSL-1.1
// Licensed under the Business Source License 1.1 (see LICENSE); Change Date: four years from publication; Change License: Apache-2.0
// Copyright (c) 2026 Empower Agile
import { describe, expect, test } from "vitest";
import narrativeTraceGlobalSetup from "../src/global-setup.js";
import { resetRunIdentityForTest, runIdentity } from "../src/run-identity-accumulator.js";

/**
 * `global-setup.ts` is a dedicated entry point re-exporting `run-identity-accumulator.ts`'s
 * default export as `default`, so `vitest.config.ts` can wire `globalSetup:
 * ["@narrativetrace/vitest/global-setup"]` without importing the main entry point (see the file's
 * own comment) — this test exercises the re-export itself, not just the function it forwards to.
 */
describe("the global-setup entry point", () => {
  test("its default export is the same narrativeTraceGlobalSetup function", () => {
    expect(narrativeTraceGlobalSetup).toBeTypeOf("function");
  });

  test("calling it establishes a run identity a later runIdentity() call reuses", () => {
    resetRunIdentityForTest();
    narrativeTraceGlobalSetup();
    const fromEnv = process.env["NARRATIVETRACE_RUN_ID"];
    expect(fromEnv).toBeDefined();
    expect(runIdentity().id).toBe(fromEnv);
    resetRunIdentityForTest();
  });
});
