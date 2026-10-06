// SPDX-License-Identifier: BUSL-1.1
// Licensed under the Business Source License 1.1 (see LICENSE); Change Date: four years from publication; Change License: Apache-2.0
// Copyright (c) 2026 Empower Agile
import { describe, expect, test } from "vitest";
import { projectState } from "../../src/init/project-state.js";
import { carrierVersionWarning, versionOf } from "../../src/init/version-guard.js";
import { fakeCarrier } from "./fixtures.js";

/**
 * D4's version guard: one line naming both versions and the command that runs the matching CLI. Never a
 * refusal, and silent when the project resolves no release at all.
 *
 * Java has no counterpart — a Gradle build resolves the carrier at the same version as everything else
 * in it, so the mismatch this guards against cannot arise there.
 */

const CARRIER = fakeCarrier(["a"], "@narrativetrace/skills@1.2.3");

describe("the version guard", () => {
  test("says nothing when the project resolves the same release", () => {
    expect(
      carrierVersionWarning(CARRIER, projectState({ projectVersion: "1.2.3" })),
    ).toBeUndefined();
  });

  test("says nothing when the project resolves no release at all", () => {
    expect(carrierVersionWarning(CARRIER, projectState())).toBeUndefined();
  });

  test("names both versions and the command that runs the matching CLI", () => {
    const warning = carrierVersionWarning(CARRIER, projectState({ projectVersion: "0.9.0" }));

    expect(warning).toContain("@narrativetrace/skills@1.2.3");
    expect(warning).toContain("0.9.0");
    expect(warning).toContain("npx --yes @narrativetrace/cli@0.9.0 init");
  });

  test("is a note, never a refusal", () => {
    const warning = carrierVersionWarning(CARRIER, projectState({ projectVersion: "0.9.0" }));

    expect(warning?.startsWith("note:")).toBe(true);
    expect(warning).not.toContain("refus");
  });

  test("warns when the carrier names no version it could compare", () => {
    const unstamped = fakeCarrier(["a"], "@narrativetrace/skills@unknown");

    expect(carrierVersionWarning(unstamped, projectState({ projectVersion: "0.9.0" }))).toContain(
      "@narrativetrace/skills@unknown",
    );
  });

  test("refuses to answer without a carrier or a snapshot", () => {
    expect(() => carrierVersionWarning(undefined as never, projectState())).toThrow(TypeError);
    expect(() => carrierVersionWarning(CARRIER, undefined as never)).toThrow(TypeError);
  });

  test.each([
    ["@narrativetrace/skills@1.2.3", "1.2.3"],
    ["@narrativetrace/skills@unknown", "unknown"],
    ["@narrativetrace/skills", ""],
    ["@scoped", ""],
    ["", ""],
  ] as const)("reads the version of %j as %j", (coordinate, expected) => {
    expect(versionOf(coordinate)).toBe(expected);
  });
});
