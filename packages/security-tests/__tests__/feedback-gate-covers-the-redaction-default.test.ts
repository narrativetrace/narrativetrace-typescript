// SPDX-License-Identifier: BUSL-1.1
// Licensed under the Business Source License 1.1 (see LICENSE); Change Date: four years from publication; Change License: Apache-2.0
// Copyright (c) 2026 Empower Agile
import { RedactionPolicy } from "@narrativetrace/core";
import { rulesRefusing } from "@narrativetrace/tooling";
import { describe, expect, test } from "vitest";
import { hostileRedactions } from "../src/corpus/hostile-corpus.js";

/**
 * "Reuse the runtime's deny-list and value shapes, never copy them" — kept by an assertion rather
 * than by a dependency, because there cannot be one.
 *
 * INTENT: `@narrativetrace/tooling` declares zero dependencies and the root architecture gate pins
 * its allowance at the empty set, so the published `@narrativetrace/cli` installs no tree at all.
 * The value-free gate therefore restates the vocabulary and the shapes as data, and THIS package,
 * the only one that may see both, holds them together: every name and every value the renderer
 * redacts by default must also be refused by the gate. A term dropped from one side and not the
 * other fails here, inside `check`, instead of in a public issue.
 *
 * @llmNote The implication is asserted in ONE direction, and the asymmetry is the design. The
 * renderer refuses an entropy heuristic and verifies every national-id checksum because a false
 * positive there silently blanks a user's data; the gate uses entropy and matches id SHAPES because
 * a false positive here is a refusal that names its rule. So the gate is a strict superset, and the
 * last test below pins that it really is strict — otherwise a future simplification could quietly
 * make the two equal and lose the entropy half.
 */

/** A canary no rule of the gate reacts to on its own — so a rejection is about the NAME. */
const NEUTRAL_VALUE = "ada";

function refusingIds(text: string): string[] {
  return rulesRefusing(text).map((rule) => rule.id);
}

const DENIED_NAMES = hostileRedactions().filter(
  (row) => row.expect === "redacted" && row.name !== undefined,
);
const SECRET_SHAPED_VALUES = hostileRedactions().filter(
  (row) => row.expect === "redacted" && row.value !== undefined,
);

describe("the value-free gate covers the renderer's redaction default", () => {
  test("the canary this suite binds is itself filable", () => {
    expect(
      refusingIds(NEUTRAL_VALUE),
      "a neutral value must pass, or every name row below would pass for the wrong reason",
    ).toEqual([]);
  });

  test("the corpus still carries both halves of the vocabulary it is read for", () => {
    expect(DENIED_NAMES.length).toBeGreaterThan(25);
    expect(SECRET_SHAPED_VALUES.length).toBeGreaterThan(20);
  });

  test.each(
    DENIED_NAMES.map((row) => [row.id, row.name as string] as const),
  )("every name the renderer redacts is also refused by the gate: %s", (id, name) => {
    expect(
      RedactionPolicy.DEFAULT.shouldRedact(name),
      `${id}: the runtime must redact this name, or the corpus row is stale`,
    ).toBe(true);

    expect(
      refusingIds(`${name}: ${NEUTRAL_VALUE}`),
      `${id}: the gate must refuse "${name}" carrying a value`,
    ).toContain("vf.named-secret");
  });

  test.each(
    SECRET_SHAPED_VALUES.map((row) => [row.id, row.value as string] as const),
  )("every value shape the renderer redacts is also refused by the gate: %s", (id, value) => {
    expect(
      RedactionPolicy.DEFAULT.shouldRedactValue(value),
      `${id}: the runtime must redact this value shape, or the corpus row is stale`,
    ).toBe(true);

    expect(refusingIds(value), `${id}: the gate must refuse the value shape`).not.toEqual([]);
  });

  test("the redaction marker is the same string on both sides", () => {
    expect(
      refusingIds(`placeOrder returned ${RedactionPolicy.MARKER}`),
      "the gate's marker rule must key on the runtime's own marker literal",
    ).toContain("vf.marker");
  });

  /**
   * The gate refuses a checksum-failing lookalike the renderer deliberately leaves VISIBLE. Both
   * decisions are right for their own surface, and this test is what stops the next person from
   * "fixing" the disagreement.
   */
  test("the gate is stricter than the renderer, and that is the design", () => {
    const badCheckDigits = "52998224726";

    expect(
      RedactionPolicy.DEFAULT.shouldRedactValue(badCheckDigits),
      "the renderer leaves a checksum-failing lookalike visible, by ruling",
    ).toBe(false);
    expect(
      refusingIds(badCheckDigits),
      "the gate refuses it anyway: an unfilable report costs a sentence, a public id does not",
    ).toContain("vf.value-shape");
  });
});
