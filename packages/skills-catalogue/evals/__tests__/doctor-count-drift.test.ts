// SPDX-License-Identifier: BUSL-1.1
// Licensed under the Business Source License 1.1 (see LICENSE); Change Date: four years from publication; Change License: Apache-2.0
// Copyright (c) 2026 Empower Agile
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { DOCTOR_CHECKS } from "@narrativetrace/tooling";
import { describe, expect, it } from "vitest";

const EVALS = join(import.meta.dirname, "..");
const WORDS: Readonly<Record<number, string>> = { 25: "twenty-five" };

function read(path: string): string {
  return readFileSync(join(EVALS, path), "utf-8");
}

/**
 * Cross-port item 7: every published check count moves in one change, held to the registry. The
 * graders are shell, so they cannot import the count; this holds their literal to it instead, so
 * a check added to the doctor fails here until every grader and the prose around them move too.
 */
describe("the doctor's check count, wherever an eval states it", () => {
  const count = DOCTOR_CHECKS.length;
  const word = WORDS[count];

  it("has a word for the current count (add one when the registry grows)", () => {
    expect(word).toBeDefined();
  });

  it.each([
    "narrativetrace-doctor/happy-path/graders/verify.sh",
    "add-narrative-tracing/grade-the-prompt.sh",
  ])("%s expects exactly the registry's count", (grader) => {
    expect(read(grader)).toContain(`report.findings.length !== ${count})`);
  });

  it.each([
    "narrativetrace-doctor/happy-path/prompt.md",
    "add-narrative-tracing/grade-the-prompt.sh",
    "fixtures/feedback-false-positive/README.md",
  ])("%s states the count in words", (page) => {
    expect(read(page)).toContain(String(word));
  });
});
