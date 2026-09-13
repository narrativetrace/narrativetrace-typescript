// SPDX-License-Identifier: BUSL-1.1
// Licensed under the Business Source License 1.1 (see LICENSE); Change Date: four years from publication; Change License: Apache-2.0
// Copyright (c) 2026 Empower Agile
import { isValidTraceId } from "@narrativetrace/core-node";
import { afterEach, beforeEach, describe, expect, test } from "vitest";
import narrativeTraceGlobalSetup, {
  resetRunIdentityForTest,
  runIdentity,
} from "../src/run-identity-accumulator.js";

describe("runIdentity", () => {
  beforeEach(() => {
    resetRunIdentityForTest();
  });
  afterEach(() => {
    resetRunIdentityForTest();
  });

  test("generates a well-formed, W3C-shaped id the first time it is asked", () => {
    const run = runIdentity();
    expect(isValidTraceId(run.id)).toBe(true);
    expect(run.name).toMatch(/^[a-z]+ [a-z]+ [a-z]+$/);
  });

  test("returns the SAME identity on every later call within the process", () => {
    const first = runIdentity();
    const second = runIdentity();
    expect(second).toEqual(first);
  });

  test("hands the id down via NARRATIVETRACE_RUN_ID so a worker can inherit it", () => {
    const run = runIdentity();
    expect(process.env.NARRATIVETRACE_RUN_ID).toBe(run.id);
  });

  test("adopts an id already present in the environment (a worker's inherited handoff)", () => {
    process.env.NARRATIVETRACE_RUN_ID = "a1b2c3d4a1b2c3d4a1b2c3d4a1b2c3d4";
    const run = runIdentity();
    expect(run.id).toBe("a1b2c3d4a1b2c3d4a1b2c3d4a1b2c3d4");
    expect(run.name).toMatch(/^[a-z]+ [a-z]+ [a-z]+$/);
  });

  test("ignores a malformed environment value and generates its own instead", () => {
    process.env.NARRATIVETRACE_RUN_ID = "not-a-trace-id";
    const run = runIdentity();
    expect(isValidTraceId(run.id)).toBe(true);
    expect(run.id).not.toBe("not-a-trace-id");
  });

  test("resetRunIdentityForTest clears both the cache and the environment handoff", () => {
    const first = runIdentity();
    resetRunIdentityForTest();
    expect(process.env.NARRATIVETRACE_RUN_ID).toBeUndefined();
    const second = runIdentity();
    expect(second.id).not.toBe(first.id);
  });

  test("narrativeTraceGlobalSetup establishes the identity so a later call reuses it", () => {
    narrativeTraceGlobalSetup();
    const fromEnv = process.env.NARRATIVETRACE_RUN_ID;
    expect(fromEnv).toBeDefined();
    expect(runIdentity().id).toBe(fromEnv);
  });
});
