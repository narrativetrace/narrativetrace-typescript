// SPDX-License-Identifier: BUSL-1.1
// Licensed under the Business Source License 1.1 (see LICENSE); Change Date: four years from publication; Change License: Apache-2.0
// Copyright (c) 2026 Empower Agile
import { renderValue } from "@narrativetrace/core";
import * as fc from "fast-check";
import { describe, expect, test } from "vitest";
import { hostileStrings } from "../src/corpus/hostile-corpus.js";
import type { CorpusCase } from "../src/corpus/types.js";
import {
  everyOutput,
  renderers,
  treeNarrating,
  treeOf,
  treeThrowing,
} from "../src/oracle/emitters.js";
import {
  everyJsonArtifactParses,
  frontmatterOf,
  isWellFormedMermaid,
  isWellFormedPlantUml,
  validatesAgainstChapterTreeSchema,
} from "../src/oracle/formats.js";
import { boundedSize, idempotent, withinBudget } from "../src/oracle/oracles.js";

/**
 * Target 3: every output format, whatever the value contained. Mirrors Java's
 * `OutputFormatPropertyTest`.
 *
 * @llmNote Each hostile string enters twice, by the two routes production actually has. As a
 * *captured value* it passes through `renderValue`, which sanitizes control characters at capture
 * time; as *narration* it does not — narration is prose an author wrote, resolved by
 * `resolveTemplate`, which never runs `ControlEscape`. Only checking the first route would leave
 * the unsanitized half of the surface untested. This file's oracle is well-formedness only
 * (schema/grammar/frontmatter); whether an unsanitized narration value can forge *structure* (open
 * a fence, add a JSON field) rather than merely render oddly is the injection-containment target's
 * job, via a benign-baseline shape comparison this well-formedness check cannot express.
 */

const FRONTMATTER_KEYS = new Set([
  "type",
  "scenario",
  "entry_point",
  "duration_ms",
  "method_count",
  "error_count",
]);

function assertWellFormed(outputs: Record<string, string>): void {
  validatesAgainstChapterTreeSchema("renderer:json", outputs["renderer:json"] as string);
  isWellFormedMermaid("renderer:mermaid", outputs["renderer:mermaid"] as string);
  isWellFormedPlantUml("renderer:plantuml", outputs["renderer:plantuml"] as string);
  assertFrontmatterWellFormed(outputs);
}

function assertFrontmatterWellFormed(outputs: Record<string, string>): void {
  for (const key of ["renderer:markdown", "renderer:markdown-document"]) {
    const keys = new Set(Object.keys(frontmatterOf(key, outputs[key] as string)));
    expect(keys, key).toEqual(FRONTMATTER_KEYS);
  }
}

function asCapturedValue(hostile: CorpusCase) {
  const rendered = renderValue(hostile.value);
  return treeOf(rendered, rendered);
}

function asNarration(hostile: CorpusCase) {
  return treeNarrating(hostile.value, hostile.value);
}

/**
 * `renderer:chapter-json` (`exportChapter`) embeds a real `timestamp: new Date().toISOString()`
 * — by design, not a bug: a "chapter complete" log record is supposed to say *when it completed*,
 * which is legitimately different on every call. Java's equivalent suite never tests a log-record
 * emitter with a wall-clock field in this set for the same reason. Idempotence here means "the
 * input didn't leak into the shape of the output", not "the wall clock stood still".
 */
function withoutVolatileFields(outputs: Record<string, string>): Record<string, string> {
  const { "renderer:chapter-json": _chapter, ...rest } = outputs;
  return rest;
}

describe("output format well-formedness", () => {
  // Slow on purpose: this is the one case that writes real artifacts to a temp directory per
  // corpus string (see Emitters' doc comment) rather than exercising only the in-memory renderers.
  test("every corpus string leaves every format well formed", () => {
    for (const hostile of hostileStrings()) {
      const captured = everyOutput(asCapturedValue(hostile));
      assertWellFormed(captured);
      everyJsonArtifactParses(captured);
      assertWellFormed(renderers(asNarration(hostile)));
    }
  }, 30_000);

  test("every corpus string keeps every format bounded", () => {
    for (const hostile of hostileStrings()) {
      boundedSize(renderers(asCapturedValue(hostile)));
      boundedSize(renderers(asNarration(hostile)));
    }
  });

  test("every corpus string renders identically twice", () => {
    for (const hostile of hostileStrings()) {
      const tree = asCapturedValue(hostile);
      idempotent(`every renderer for ${hostile.id}`, () =>
        JSON.stringify(withoutVolatileFields(renderers(tree))),
      );
    }
  });

  test("every renderer is present so a rename cannot silently skip one", () => {
    const outputs = everyOutput(treeOf('"a"', '"b"'));

    for (const key of [
      "renderer:prose",
      "renderer:indented",
      "renderer:markdown",
      "renderer:markdown-document",
      "renderer:json",
      "renderer:chapter-json",
      "renderer:canonical-json",
      "renderer:clarity-json",
      "renderer:mermaid",
      "renderer:plantuml",
    ]) {
      expect(Object.keys(outputs), key).toContain(key);
    }
    expect(Object.keys(outputs).some((k) => k.endsWith(".json"))).toBe(true);
    expect(Object.keys(outputs).some((k) => k.endsWith(".mmd"))).toBe(true);
  });

  test("any generated value leaves every format well formed", () => {
    fc.assert(
      fc.property(hostileTextArb(), (value) => {
        const rendered = renderValue(value);
        assertWellFormed(renderers(treeOf(rendered, rendered)));
        assertWellFormed(renderers(treeNarrating(value, value)));
      }),
      { numRuns: 80 },
    );
  });

  test("an exception message leaves every format well formed", () => {
    fc.assert(
      fc.property(hostileTextArb(), (message) => {
        assertWellFormed(renderers(treeThrowing(new Error(message))));
      }),
      { numRuns: 50 },
    );
  });

  test("a hostile string never costs unbounded time through any format", () => {
    for (const hostile of hostileStrings()) {
      withinBudget(`captured ${hostile.id}`, () => everyOutput(asCapturedValue(hostile)));
    }
  });
});

/** The corpus alphabet, recombined — the part that finds what nobody listed. */
function hostileTextArb(): fc.Arbitrary<string> {
  const alphabet = fc.constantFrom(
    '"',
    "\\",
    "/",
    "\n",
    "\r",
    "\t",
    "{",
    "}",
    "[",
    "]",
    ":",
    ",",
    "`",
    ">",
    "-",
    " ",
    "A",
    "z",
    "0",
    "#",
    "|",
    "*",
    "&",
    "!",
    "%",
    "@",
    "'",
    "~",
    "$",
    "<",
    "```",
    "---",
    "->>",
    "%%",
    String.fromCodePoint(0x0000),
    String.fromCodePoint(0x001b),
    String.fromCodePoint(0x202e),
    String.fromCodePoint(0x200b),
    String.fromCharCode(0xd800),
    "🙈",
  );
  return fc.array(alphabet, { maxLength: 24 }).map((parts) => parts.join(""));
}
