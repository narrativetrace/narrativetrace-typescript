// SPDX-License-Identifier: BUSL-1.1
// Licensed under the Business Source License 1.1 (see LICENSE); Change Date: four years from publication; Change License: Apache-2.0
// Copyright (c) 2026 Empower Agile
import { rulesRefusing, VALUE_FREE_RULES } from "@narrativetrace/tooling";
import { describe, expect, test } from "vitest";
import { hostileFeedbacks } from "../src/corpus/hostile-corpus.js";
import { type FeedbackCase, mustBeRejected } from "../src/corpus/types.js";

/**
 * The shared corpus replayed against the value-free gate, one row at a time.
 *
 * INTENT: `feedback.json` is the cross-runtime master for this gate — every runtime copies it
 * verbatim and reimplements only its reader — so what it means has to be asserted here rather than
 * agreed in prose. A row is a decision: "this text must never reach a public issue, for this named
 * reason", or "this text must be filable, or an agent will learn to work around the gate".
 *
 * @llmNote A rejected row asserts the named rule is AMONG the refusing rules, not that it is the
 * only one. Several rules firing on one line is the normal case — a pasted rendered trace breaks
 * the call rule and the duration rule together — and demanding exactness would make the corpus a
 * record of this implementation's internals rather than of the product's promise.
 *
 * @llmNote The ACCEPTED half comes first in this file on purpose. The rejected rows are the easy
 * half; the accepted rows are where a port discovers its rules are unusable, and the closest margin
 * in the product is a real structural-artifact path at 3.958 bits per character — four hundredths
 * under the ceiling that would refuse it as a secret.
 */

function refusingIds(row: FeedbackCase): string[] {
  return rulesRefusing(row.value).map((rule) => rule.id);
}

const ACCEPTED = hostileFeedbacks().filter((row) => !mustBeRejected(row));
const REJECTED = hostileFeedbacks().filter(mustBeRejected);

describe("the accepted half of the feedback corpus stays filable", () => {
  test.each(ACCEPTED.map((row) => [row.id, row] as const))("%s", (_id, row) => {
    expect(refusingIds(row), `${row.id} (${row.description}) must be filable`).toEqual([]);
  });
});

describe("the rejected half of the feedback corpus is refused by the rule it names", () => {
  test.each(REJECTED.map((row) => [row.id, row] as const))("%s", (_id, row) => {
    expect(
      refusingIds(row),
      `${row.id} (${row.description}) must be refused by ${row.rule}`,
    ).toContain(row.rule);
  });
});

describe("the corpus and the rule set account for each other", () => {
  test("every rule the corpus names exists in the gate", () => {
    const ids = VALUE_FREE_RULES.map((rule) => rule.id);
    for (const row of REJECTED) expect(ids, row.id).toContain(row.rule);
  });

  /** A rule nobody replays is a rule nobody has tested. */
  test("every rule in the gate is exercised by at least one row", () => {
    const replayed = REJECTED.map((row) => row.rule);
    for (const rule of VALUE_FREE_RULES) expect(replayed, rule.id).toContain(rule.id);
  });
});
