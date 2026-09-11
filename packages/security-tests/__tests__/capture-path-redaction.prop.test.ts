// SPDX-License-Identifier: BUSL-1.1
// Licensed under the Business Source License 1.1 (see LICENSE); Change Date: four years from publication; Change License: Apache-2.0
// Copyright (c) 2026 Empower Agile
import { NarrativeTraceConfig, SyncNarrativeContext, type TraceTree } from "@narrativetrace/core";
import { traceObject } from "@narrativetrace/proxy";
import { describe, expect, test } from "vitest";
import { hostileRedactions } from "../src/corpus/hostile-corpus.js";
import { isNameCase, type RedactionCase, secretOf } from "../src/corpus/types.js";
import { everyOutput } from "../src/oracle/emitters.js";
import { withinBudget } from "../src/oracle/oracles.js";

/**
 * Replays `redaction.json` through the REAL capture path, `traceObject()` — not `renderValue()`
 * called directly. This is the gap the 2026-09 audit found: the corpus already had every row this
 * suite needs (multilingual name vocabulary, accented/decomposed/folded spellings, national-id
 * value shapes, and the false-positive half that proves the default isn't switched on out of
 * paranoia) but nothing in this runtime had ever driven it through a method call — every consumer
 * fed the value renderer directly, one layer below where the parameter-name defect actually lived.
 * Mirrors Java's `CaptureRedactionPropertyTest` (2026-09-10, family-wide).
 *
 * @llmNote Assert on the captured `ParameterCapture`, not only on rendered text. The renderers
 * read `renderedValue` off an already-decided capture; a renderer-only assertion is exactly what
 * passed all year while the capture path itself leaked. The property test still runs `everyOutput`
 * too — a capture-level pass that a downstream renderer somehow undoes would be its own defect.
 */

const INNOCUOUS_VALUE_PARAM_NAME = "data";

class Probe {
  method(_value: unknown): string {
    return "ok";
  }
}

/** Drives one argument through a real `traceObject()` proxy under a fresh context, named
 * `paramName` — the one config-supplied seam every application actually uses (`MethodTraceConfig`/
 * the decorator-metadata twin), not a test-only shortcut. */
function captureThroughTraceObject(paramName: string, argument: unknown) {
  const context = new SyncNarrativeContext(new NarrativeTraceConfig("detail"));
  const traced = traceObject(new Probe(), context, { method: [paramName] });
  traced.method(argument);
  const tree = context.captureTrace();
  const param = tree.roots[0]?.signature.parameters[0];
  if (!param) throw new Error("expected exactly one captured parameter");
  return { param, tree };
}

function driveCase(redactionCase: RedactionCase): {
  renderedValue: string;
  redacted: boolean;
  tree: TraceTree;
} {
  const paramName = isNameCase(redactionCase)
    ? (redactionCase.name as string)
    : INNOCUOUS_VALUE_PARAM_NAME;
  const argument = isNameCase(redactionCase) ? redactionCase.canary : redactionCase.value;
  const { param, tree } = captureThroughTraceObject(paramName, argument);
  return { renderedValue: param.renderedValue, redacted: param.redacted, tree };
}

// 2026-09-10: every national-id value shape (RUT/CPF/CNPJ/Spanish DNI-NIE/French NIR/Chinese
// resident id) is now implemented (secret-value-shapes.ts), so every row in the corpus is
// representable and none is skipped. This set — and the loud, per-row accounting below — stays in
// the file rather than being deleted: if a *future* corpus row names a scheme this runtime still
// cannot answer for, the mechanism to skip it loudly, by explicit id, with a stated reason, is
// still here to reach for, rather than reinvented under pressure or silently glossed over.
const SKIPPED_UNIMPLEMENTED_NATIONAL_ID_SHAPE: ReadonlySet<string> = new Set([]);

function skipReason(id: string): string | undefined {
  return SKIPPED_UNIMPLEMENTED_NATIONAL_ID_SHAPE.has(id)
    ? `${id}: this runtime has no value-shape detector for the national-id scheme this row tests` +
        " (see the SKIPPED_UNIMPLEMENTED_NATIONAL_ID_SHAPE comment for which one and why) — a" +
        " pre-existing, separately-tracked gap, not a defect in the capture-path fix this suite guards"
    : undefined;
}

// Oracle contract clause 3/6: the captured
// `redacted` flag must be true for every "redacted" row and false for every "visible" one, for
// BOTH axes — a value caught by shape must flag exactly as a name caught by the deny-list.
// Asserted separately from the rendered-text checks below so a flag defect fails distinctly from
// a leak.
function assertRedactedFlag(redactionCase: RedactionCase, redacted: boolean): void {
  if (redactionCase.expect === "redacted") {
    expect(redacted, `${redactionCase.id}: the captured parameter must be flagged redacted`).toBe(
      true,
    );
  } else {
    expect(
      redacted,
      `${redactionCase.id}: the captured parameter must NOT be flagged redacted (over-flagging)`,
    ).toBe(false);
  }
}

function assertRedactionCase(redactionCase: RedactionCase): void {
  const secret = secretOf(redactionCase);
  const { renderedValue, redacted, tree } = withinBudget(`capture ${redactionCase.id}`, () =>
    driveCase(redactionCase),
  );
  assertRedactedFlag(redactionCase, redacted);
  const outputs = everyOutput(tree);
  if (redactionCase.expect === "redacted") {
    expect(
      renderedValue,
      `${redactionCase.id}: the captured parameter must not carry the secret`,
    ).not.toContain(secret);
    for (const [emitter, output] of Object.entries(outputs)) {
      expect(output, `${redactionCase.id}: ${emitter} leaked the secret`).not.toContain(secret);
    }
  } else {
    expect(
      renderedValue,
      `${redactionCase.id}: must survive at capture — a default that blanks ordinary business` +
        " data is one teams switch off entirely",
    ).toContain(secret);
    for (const [emitter, output] of Object.entries(outputs)) {
      if (isNamingQualityOnly(emitter)) continue;
      expect(
        output,
        `${redactionCase.id}: ${emitter} over-redacted a value that must survive`,
      ).toContain(secret);
    }
  }
}

// The clarity-json emitter (in-memory and its on-disk artifact twin) reports naming-QUALITY
// scores and suggestions — method/class/parameter name clarity — and never echoes a captured
// argument's VALUE at all, redacted or not. It correctly never leaks a "redacted" secret (nothing
// to leak), but it also can never carry a "visible" one, for the same structural reason: it is not
// a value-carrying output. Excluded only from the survival check; still included, harmlessly, in
// the leak check above.
function isNamingQualityOnly(emitter: string): boolean {
  return emitter.includes("clarity");
}

describe("hostile corpus redaction, replayed through traceObject() capture", () => {
  const allCases = hostileRedactions();
  const runnable = allCases.filter((c) => skipReason(c.id) === undefined);
  const skipped = allCases.filter((c) => skipReason(c.id) !== undefined);

  // Loud by construction: this count is asserted, not just logged, so a future change to either
  // the corpus or the skip list that silently drops a row's coverage fails the build.
  test("row accounting: every corpus row is either run or loudly skipped, none silently dropped", () => {
    expect(
      allCases.length,
      "corpus size — update this suite if redaction.json's row count moves",
    ).toBe(88);
    expect(runnable.length + skipped.length).toBe(allCases.length);
    expect(runnable.length, "rows actually driven through traceObject() capture").toBe(88);
    expect(skipped.length, "rows skipped — see SKIPPED_UNIMPLEMENTED_NATIONAL_ID_SHAPE").toBe(0);
  });

  test.each(runnable.map((c) => [c.id, c] as const))("%s", (_id, redactionCase) => {
    assertRedactionCase(redactionCase);
  });

  test.each(skipped.map((c) => [c.id, c] as const))("%s — SKIPPED LOUDLY", (id, redactionCase) => {
    console.warn(`SKIPPED ${id}: ${skipReason(redactionCase.id)}`);
    expect(skipReason(redactionCase.id)).toBeDefined();
  });
});
