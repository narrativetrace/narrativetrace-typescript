// SPDX-License-Identifier: BUSL-1.1
// Licensed under the Business Source License 1.1 (see LICENSE); Change Date: four years from publication; Change License: Apache-2.0
// Copyright (c) 2026 Empower Agile
import { randomBytes } from "node:crypto";
import { expect, vi } from "vitest";
import {
  fenceCount,
  frontmatterFenceCount,
  frontmatterOf,
  jsonShape,
  parseJson,
  statementsOf,
} from "./formats.js";

/**
 * The assertions every fuzz target shares. A crash alone is not an oracle.
 *
 * INTENT: `documentation/security-testing.md` lists seven oracles; every property test in this
 * package asserts from this shared list rather than inlining its own copy, so "this runtime
 * implements the same oracles" is checkable by reading this file once.
 *
 * @llmNote The redaction oracle looks for a fresh random token per case, not a fixed string. A
 * fixed secret is findable by a renderer that special-cases it and, worse, is findable by a *test*
 * that passes because some earlier case cleared the same string out. It also checks a prefix of the
 * token, because a partial leak through a truncating emitter is still a leak.
 */

/** Wall-clock budget for one input through one emitter — a hang detector, not a benchmark. */
export const BUDGET_MILLIS = 10_000;

/** Ceiling on one emitter's output; generous, since diagrams and documents legitimately repeat a value. */
export const MAX_OUTPUT_BYTES = 4 * 1024 * 1024;

/** How much of a sentinel must be absent for the redaction oracle to pass. */
const PARTIAL_LEAK_LENGTH = 12;

/**
 * A token no output may carry, unique per case.
 *
 * @returns a token whose leading `sentinel` prefix makes a failure readable and whose random tail
 * makes a false positive impossible.
 */
export function freshSentinel(): string {
  return `sentinel${randomBytes(7).toString("hex")}`;
}

/** Runs `work`, failing when it takes longer than {@link BUDGET_MILLIS}. */
export function withinBudget<T>(label: string, work: () => T): T {
  const start = performance.now();
  const result = work();
  const elapsedMillis = performance.now() - start;
  expect(elapsedMillis, `${label} must cost bounded time in the size of its input`).toBeLessThan(
    BUDGET_MILLIS,
  );
  return result;
}

/** Every emitter's output stays under {@link MAX_OUTPUT_BYTES}. */
export function boundedSize(outputs: Readonly<Record<string, string>>): void {
  for (const [emitter, output] of Object.entries(outputs)) {
    expect(output.length, `${emitter} must produce bounded output`).toBeLessThan(MAX_OUTPUT_BYTES);
  }
}

/**
 * The redaction oracle: the sentinel reaches no byte of any output, whole or partial.
 *
 * @param outputs every emitter's output, keyed by emitter.
 * @param sentinel the token planted behind `@notTraced`/the deny-list.
 */
export function containsNoSentinel(
  outputs: Readonly<Record<string, string>>,
  sentinel: string,
): void {
  const partial = sentinel.slice(0, PARTIAL_LEAK_LENGTH);
  expect(
    Object.keys(outputs).length,
    "a value marked redacted must appear in no output of any format at any depth",
  ).toBeGreaterThan(0);
  for (const [emitter, output] of Object.entries(outputs)) {
    expect(output, `${emitter} leaked the redacted value`).not.toContain(sentinel);
    expect(output, `${emitter} leaked the leading bytes of the redacted value`).not.toContain(
      partial,
    );
  }
}

/** Rendering twice produces the same bytes — no time, identity or iteration order leaks in. */
export function idempotent(label: string, render: () => string): void {
  expect(render(), `${label} must render identically twice`).toBe(render());
}

/**
 * The structural-shape oracle: two renderer outputs describe the same document shape — same JSON
 * shape, the same number of Mermaid statements, the same frontmatter keys, the same code/
 * frontmatter fence counts — even though their content differs.
 *
 * INTENT: the AI-consumer/document-structure oracle. An escape that leaked would add a JSON
 * field, a Mermaid statement, a frontmatter key or an unbalanced fence — changing the *shape*
 * while each individual document stays well formed, which is exactly what a well-formedness
 * check alone would miss.
 */
export function sameStructuralShape(
  benign: Readonly<Record<string, string>>,
  hostile: Readonly<Record<string, string>>,
): void {
  expect(jsonShape(parseJson("hostile", hostile["renderer:json"] as string))).toBe(
    jsonShape(parseJson("benign", benign["renderer:json"] as string)),
  );
  expect(statementsOf(hostile["renderer:mermaid"] as string)).toHaveLength(
    statementsOf(benign["renderer:mermaid"] as string).length,
  );
  expect(
    Object.keys(frontmatterOf("hostile", hostile["renderer:markdown"] as string)).sort(),
  ).toEqual(Object.keys(frontmatterOf("benign", benign["renderer:markdown"] as string)).sort());
  sameMarkdownFenceCounts(benign, hostile);
}

function sameMarkdownFenceCounts(
  benign: Readonly<Record<string, string>>,
  hostile: Readonly<Record<string, string>>,
): void {
  const document = "renderer:markdown-document";
  expect(
    fenceCount(hostile[document] as string),
    "a value must not open or close a code fence",
  ).toBe(fenceCount(benign[document] as string));
  expect(
    frontmatterFenceCount(hostile[document] as string),
    "a value must not open or close the frontmatter block",
  ).toBe(frontmatterFenceCount(benign[document] as string));
}

/**
 * No timer or handle this library starts survives a render — the JS analog of Java's
 * "no library thread left behind" oracle (rendering is synchronous here, so there is no thread to
 * leak; a stray `setInterval`/`setTimeout`/`setImmediate` left registered is the equivalent hazard).
 *
 * @param work the synchronous render call to audit.
 */
export function noHandleLeft<T>(work: () => T): T {
  const interval = vi.spyOn(globalThis, "setInterval");
  const timeout = vi.spyOn(globalThis, "setTimeout");
  try {
    const result = work();
    expect(interval, "rendering must not register a background interval").not.toHaveBeenCalled();
    expect(timeout, "rendering must not register a background timeout").not.toHaveBeenCalled();
    return result;
  } finally {
    interval.mockRestore();
    timeout.mockRestore();
  }
}
