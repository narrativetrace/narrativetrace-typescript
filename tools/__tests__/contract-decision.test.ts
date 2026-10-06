// SPDX-License-Identifier: BUSL-1.1
// Licensed under the Business Source License 1.1 (see LICENSE); Change Date: four years from publication; Change License: Apache-2.0
// Copyright (c) 2026 Empower Agile
import { describe, expect, it } from "vitest";
import { type ContractEntry, decide } from "../contract-decision.js";

function entry(overrides: Partial<ContractEntry>): ContractEntry {
  return {
    id: "sample",
    kind: "probed-default",
    page: "documentation/x.md#y",
    claim: "sample claim",
    expect: "true",
    probe: "contract-probe/probes/sample.mjs",
    ...overrides,
  };
}

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

  it("fails a could-not-probe observation without blaming the published package", () => {
    const observed = "could-not-probe: Vitest never reached test execution — Error: not found";
    const outcome = decide(entry({ coordinate: "@narrativetrace/x" }), "0.1.3", observed);
    expect(outcome.verdict).toBe("fails");
    expect(outcome.message).toContain("COULD NOT BE PROBED");
    expect(outcome.message).toContain("Error: not found");
    // The whole point of the distinction: no "(published) reads <off value>" claim about the
    // package the harness never actually managed to drive.
    expect(outcome.message).not.toContain("(published) reads");
  });

  it("still reports a real off-value observation as a verdict about the package", () => {
    const outcome = decide(entry({ coordinate: "@narrativetrace/x" }), "0.1.3", "false");
    expect(outcome.verdict).toBe("fails");
    expect(outcome.message).toContain("(published) reads");
    expect(outcome.message).not.toContain("COULD NOT BE PROBED");
  });

  // The four historical instances this gate exists for, reproduced as fixtures so the decision
  // logic is provable offline, without a release.
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

    it("instance 4 (platform-type carve-out): a claim the artifact does not honour — FAILS", () => {
      const outcome = decide(
        entry({ id: "probed-platform-type-carveout", expect: "own-tostring-used" }),
        "0.1.1",
        "field-introspection-used", // the published artifact took the other path
      );
      expect(outcome.verdict).toBe("fails");
    });
  });
});
