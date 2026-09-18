// SPDX-License-Identifier: BUSL-1.1
// Licensed under the Business Source License 1.1 (see LICENSE); Change Date: four years from publication; Change License: Apache-2.0
// Copyright (c) 2026 Empower Agile
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

// Rule-5 shape (derive, never copy): `scripts/gate.sh` must invoke `pnpm run check` as a whole,
// never re-enumerate `check`'s own steps as a second, hand-kept list that can silently drift out
// of step with package.json's `check` script — the 2026-09-18 finding: 10 of `check`'s steps
// (including `legal-check` and `duplication:check`) had gone missing from gate.sh's hand-copied
// list while `check` itself kept growing.
describe("scripts/gate.sh derives from `check`, never re-enumerates its steps", () => {
  it("invokes `pnpm run check` and does not separately invoke any of check's own step scripts", () => {
    const packageJson = JSON.parse(readFileSync("package.json", "utf-8")) as {
      scripts: Record<string, string>;
    };
    const checkScript = packageJson.scripts.check;
    // Every `pnpm run <name>` step `check` chains together, in the order it runs them.
    const stepNames = [...checkScript.matchAll(/pnpm run ([a-zA-Z0-9:_-]+)/g)].map((m) => m[1]);
    // Sanity: `check` really is the long multi-step chain this test means to guard — if it ever
    // shrinks to nothing, the absence of a re-enumeration would be true for the wrong reason.
    expect(stepNames.length).toBeGreaterThan(10);

    const gateSh = readFileSync("scripts/gate.sh", "utf-8");
    expect(gateSh).toMatch(/\bpnpm run check\b/);

    for (const step of stepNames) {
      if (step === "check") continue;
      const invokedTwice = new RegExp(`pnpm run ${step}\\b`).test(gateSh);
      expect(
        invokedTwice,
        `gate.sh must not separately invoke 'pnpm run ${step}' — derive from 'pnpm run check' instead of copying its steps`,
      ).toBe(false);
    }
  });
});
