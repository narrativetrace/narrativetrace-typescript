// SPDX-License-Identifier: BUSL-1.1
// Licensed under the Business Source License 1.1 (see LICENSE); Change Date: four years from publication; Change License: Apache-2.0
// Copyright (c) 2026 Empower Agile
import { describe, expect, it } from "vitest";
import { classifyStatus, pollPresence, versionUrl } from "../verify-publication-registry.js";

describe("classifyStatus", () => {
  it.each([
    [200, "PRESENT"],
    [404, "LAGGING"],
    [500, "MISSING"],
    [0, "MISSING"],
  ] as const)("%i -> %s", (status, verdict) => {
    expect(classifyStatus(status)).toBe(verdict);
  });
});

describe("versionUrl", () => {
  it("builds the registry path for a scoped package version", () => {
    expect(versionUrl("https://registry.npmjs.org", "@narrativetrace/core", "0.1.1")).toBe(
      "https://registry.npmjs.org/@narrativetrace/core/0.1.1",
    );
  });
});

describe("pollPresence", () => {
  const targets = [
    { name: "@nt/a", version: "1.0.0" },
    { name: "@nt/b", version: "1.0.0" },
  ];

  it("returns immediately when every target is already present, with no sleep", async () => {
    const sleep = async () => {
      throw new Error("should not have slept");
    };
    const verdicts = await pollPresence(targets, {
      fetchStatus: async () => 200,
      sleep,
    });
    expect(verdicts.get("@nt/a")).toBe("PRESENT");
    expect(verdicts.get("@nt/b")).toBe("PRESENT");
  });

  it("re-checks only the still-pending targets on each round", async () => {
    const calls: string[] = [];
    let round = 0;
    const fetchStatus = async (url: string) => {
      calls.push(url);
      return url.includes("@nt/a") || round > 0 ? 200 : 404;
    };
    const sleep = async () => {
      round++;
    };
    const verdicts = await pollPresence(targets, {
      fetchStatus,
      sleep,
      initialBackoffMs: 1,
      timeoutMs: 10_000,
    });
    expect(verdicts.get("@nt/a")).toBe("PRESENT");
    expect(verdicts.get("@nt/b")).toBe("PRESENT");
    // Round 1 checks both; round 2 (after b's own recheck flips it) checks only b.
    expect(calls.filter((u) => u.includes("@nt/a")).length).toBe(1);
  });

  it("gives up at the overall deadline and reports what is still missing", async () => {
    // A fully synthetic clock: no real wall-clock time is spent or asserted on, per this repo's
    // own "wall-clock is never a test input" rule — advancing it is what drives `sleep` here.
    let clock = 0;
    const now = () => clock;
    const sleep = async (ms: number) => {
      clock += ms;
    };
    const verdicts = await pollPresence(targets, {
      fetchStatus: async () => 404,
      sleep,
      now,
      initialBackoffMs: 100,
      timeoutMs: 250,
    });
    expect(verdicts.get("@nt/a")).toBe("LAGGING");
    expect(verdicts.get("@nt/b")).toBe("LAGGING");
  });

  it("calls onPending with the still-missing targets before backing off", async () => {
    const pendingRounds: string[][] = [];
    let calls = 0;
    await pollPresence(targets, {
      fetchStatus: async () => {
        calls++;
        return calls > 2 ? 200 : 404;
      },
      sleep: async () => {},
      onPending: (pending) => pendingRounds.push(pending.map((t) => t.name)),
      initialBackoffMs: 1,
      timeoutMs: 10_000,
    });
    expect(pendingRounds.length).toBeGreaterThan(0);
    expect(pendingRounds[0]).toEqual(["@nt/a", "@nt/b"]);
  });
});
