// SPDX-License-Identifier: BUSL-1.1
// Licensed under the Business Source License 1.1 (see LICENSE); Change Date: four years from publication; Change License: Apache-2.0
// Copyright (c) 2026 Empower Agile
import { describe, expect, test } from "vitest";
import { ghAuthenticatedBy, type ProbeResult } from "../src/gh-auth-probe.js";

/**
 * The four outcomes of asking an installed `gh` whether it is signed in — and not one of these
 * cases starts a process.
 *
 * INTENT: the DECISION is what is worth testing ("which outcomes mean signed in"), and testing it by
 * installing a tool would be testing the machine. The seam is a runner that hands back a result, so
 * every outcome is reachable, including the two a real host cannot be asked to produce on demand.
 */
describe("whether gh is signed in", () => {
  test("yes only when the tool ran and exited zero", () => {
    expect(ghAuthenticatedBy(() => ({ status: 0 }))).toBe(true);
  });

  test("no when the tool is there and signed out", () => {
    expect(ghAuthenticatedBy(() => ({ status: 1 }))).toBe(false);
  });

  test("no when the tool is not installed at all", () => {
    const absent: ProbeResult = { status: null, error: enoent() };

    expect(ghAuthenticatedBy(() => absent)).toBe(false);
  });

  test("no when the probe timed out, even though it did start", () => {
    const timedOut: ProbeResult = { status: null, error: new Error("ETIMEDOUT") };

    expect(ghAuthenticatedBy(() => timedOut)).toBe(false);
  });

  test("no when the platform cannot start a process at all", () => {
    expect(
      ghAuthenticatedBy(() => {
        throw new Error("spawnSync is not available here");
      }),
    ).toBe(false);
  });

  /**
   * A probe that answered "signed in" on a zero status it never got would offer a channel that
   * cannot work — so the status is read as well as the error, not instead of it.
   */
  test("no when the tool exited zero but reported an error anyway", () => {
    expect(ghAuthenticatedBy(() => ({ status: 0, error: enoent() }))).toBe(false);
  });
});

function enoent(): Error {
  return Object.assign(new Error("spawnSync gh ENOENT"), { code: "ENOENT" });
}
