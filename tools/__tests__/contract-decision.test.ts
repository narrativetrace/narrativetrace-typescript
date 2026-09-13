// SPDX-License-Identifier: BUSL-1.1
// Licensed under the Business Source License 1.1 (see LICENSE); Change Date: four years from publication; Change License: Apache-2.0
// Copyright (c) 2026 Empower Agile
import { describe, expect, it } from "vitest";
import { type ContractEntry, decide, isApplicable } from "../contract-decision.js";

function entry(overrides: Partial<ContractEntry>): ContractEntry {
  return {
    id: "sample",
    kind: "probed-default",
    page: "documentation/x.md#y",
    claim: "sample claim",
    since: "0.1.0",
    expect: "true",
    probe: "contract-probe/probes/sample.mjs",
    ...overrides,
  };
}

describe("isApplicable", () => {
  it("is true when since is strictly earlier than the installed version", () => {
    expect(isApplicable("0.1.0", "0.1.3")).toBe(true);
  });

  it("is true when since equals the installed version — since holds AT that version", () => {
    expect(isApplicable("0.1.3", "0.1.3")).toBe(true);
  });

  it("is false when since is strictly later than the installed version", () => {
    expect(isApplicable("0.1.3", "0.1.1")).toBe(false);
  });

  it("compares numerically, not lexicographically (0.1.10 vs 0.1.9)", () => {
    expect(isApplicable("0.1.10", "0.1.9")).toBe(false);
    expect(isApplicable("0.1.9", "0.1.10")).toBe(true);
  });
});

describe("decide", () => {
  it("holds when the observed value matches expect", () => {
    const outcome = decide(entry({ expect: "true" }), "0.1.3", "true");
    expect(outcome.verdict).toBe("holds");
  });

  it("fails, naming the coordinate/id/expect/observed, when the observed value differs", () => {
    const outcome = decide(
      entry({ id: "probed-x", coordinate: "@narrativetrace/x", expect: "true" }),
      "0.1.3",
      "false",
    );
    expect(outcome.verdict).toBe("fails");
    expect(outcome.message).toContain("probed-x");
    expect(outcome.message).toContain("@narrativetrace/x");
    expect(outcome.message).toContain('"true"');
    expect(outcome.message).toContain('"false"');
  });

  it("fails, naming <no answer>, when the probe could not even run (observed undefined)", () => {
    const outcome = decide(entry({}), "0.1.3", undefined);
    expect(outcome.verdict).toBe("fails");
    expect(outcome.message).toContain("<no answer>");
  });

  it("is not-applicable-before-since — never fails — when since is later than installed", () => {
    const outcome = decide(entry({ since: "0.2.0" }), "0.1.3", "anything at all");
    expect(outcome.verdict).toBe("not-applicable-before-since");
  });

  // docs-vs-published-gate-2026-09-12.md §3's four historical instances, reproduced as fixtures so
  // the decision logic is provable offline, without a release (design note's own requirement).
  describe("the four historical instances", () => {
    it("instance 1 (entry-point): a doc-cited coordinate that does not resolve — FAILS", () => {
      const outcome = decide(
        entry({
          id: "entry-point-core",
          kind: "entry-point",
          coordinate: "@narrativetrace/core",
          expect: "PRESENT",
        }),
        "0.1.1",
        undefined, // the registry probe found nothing at this coordinate/version
      );
      expect(outcome.verdict).toBe("fails");
    });

    it("instance 2 (probed-default): a documented default the published artifact does not honour — FAILS", () => {
      const outcome = decide(
        entry({ id: "probed-narrativetrace-output-default", expect: "true" }),
        "0.1.1",
        "false", // the published artifact actually observed writing unconditionally
      );
      expect(outcome.verdict).toBe("fails");
    });

    it("instance 3 (config-shape): a documented shape with no observable effect — FAILS", () => {
      const outcome = decide(
        entry({
          id: "config-shape-trace-object-rejects-unknown-keys",
          kind: "config-shape",
          expect: "throws",
        }),
        "0.1.1",
        "no-throw", // the published artifact silently accepted the unrecognised key
      );
      expect(outcome.verdict).toBe("fails");
    });

    it("instance 4 (ruling 1): a since later than installed is skipped, never a fail", () => {
      const outcome = decide(
        entry({ id: "probed-platform-type-carveout", since: "0.1.3", expect: "own-tostring-used" }),
        "0.1.1",
        undefined, // the probe never even needs to run for a skipped entry
      );
      expect(outcome.verdict).toBe("not-applicable-before-since");
    });
  });
});
