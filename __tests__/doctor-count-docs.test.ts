// SPDX-License-Identifier: BUSL-1.1
// Licensed under the Business Source License 1.1 (see LICENSE); Change Date: four years from publication; Change License: Apache-2.0
// Copyright (c) 2026 Empower Agile
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { DOCTOR_CHECKS } from "../packages/tooling/src/doctor/doctor.js";

const WORDS: Readonly<Record<number, string>> = { 25: "Twenty-five" };

/** Cross-port item 7: the count llms.txt publishes is the registry's, moved in the same change. */
describe("llms.txt's doctor paragraph", () => {
  it("states the registry's own check count", () => {
    const word = WORDS[DOCTOR_CHECKS.length];
    expect(word, `add a word for ${DOCTOR_CHECKS.length}`).toBeDefined();
    expect(readFileSync("documentation/llms.txt", "utf-8")).toContain(`${word} checks: `);
  });
});
