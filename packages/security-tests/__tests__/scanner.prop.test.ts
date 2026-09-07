// SPDX-License-Identifier: BUSL-1.1
// Licensed under the Business Source License 1.1 (see LICENSE); Change Date: four years from publication; Change License: Apache-2.0
// Copyright (c) 2026 Empower Agile
import {
  analyzeClarity,
  exportClarityJson,
  renderClarityReport,
  scoreClassName,
  scoreMethodName,
  scoreParameterName,
  tokenize,
} from "@narrativetrace/clarity";
import {
  methodSignature,
  parameterCapture,
  returned,
  type TraceTree,
  traceNode,
  traceTree,
} from "@narrativetrace/core";
import {
  classCandidate,
  exceptionCandidate,
  glossary,
  harvestStatic,
  harvestTraces,
  methodCandidates,
  normalizePhrase,
  parameterCandidate,
} from "@narrativetrace/glossary";
import * as fc from "fast-check";
import { describe, expect, test } from "vitest";
import { hostileStrings } from "../src/corpus/hostile-corpus.js";
import { parseJson } from "../src/oracle/formats.js";
import { withinBudget } from "../src/oracle/oracles.js";

/**
 * Target 5: the clarity and glossary scanners over arbitrary identifier text. Mirrors Java's
 * `ScannerPropertyTest`.
 *
 * @llmNote These read names, not values, which is why they look safe — but a name reaches them
 * from wherever `class`/`function`/property names come from, which is not always a hand-written
 * identifier: a minifier, a bundler's scope-hoisting rename, a dynamically constructed class, a
 * decorator-generated accessor. Scoring must survive all of them, and the term normalizer must
 * reject only through its declared guard, never crash through an unguarded one.
 */

function treeNamed(identifier: string): TraceTree {
  const node = traceNode(
    methodSignature(identifier, identifier, [parameterCapture(identifier, '"v"', false)]),
    returned('"ok"'),
    [],
  );
  return traceTree([node]);
}

const EMPTY_GLOSSARY = glossary(1, new Map(), []);
const CONSTANT_CONTEXT = () => "com.example";

function assertScoresAreUsable(identifier: string, label: string): void {
  expect(scoreMethodName(identifier), `method score for ${label}`).toBeGreaterThanOrEqual(0);
  expect(scoreMethodName(identifier), `method score for ${label}`).toBeLessThanOrEqual(1);
  expect(scoreClassName(identifier), `class score for ${label}`).toBeGreaterThanOrEqual(0);
  expect(scoreClassName(identifier), `class score for ${label}`).toBeLessThanOrEqual(1);
  expect(scoreParameterName(identifier), `parameter score for ${label}`).toBeGreaterThanOrEqual(0);
  expect(scoreParameterName(identifier), `parameter score for ${label}`).toBeLessThanOrEqual(1);
  expect(tokenize(identifier), `tokens for ${label}`).not.toBeNull();
}

/**
 * Java's ScannerPropertyTest names two shapes that must reject through the declared guard: a blank
 * identifier, and one that tokenizes to no words at all (`__`). This port's actual guard
 * (`term-normalizer.ts`'s `normalizedTokens`) is a strict superset of Java's: it rejects not only
 * an empty token list but any token list whose joined text carries no `\p{L}\p{N}` character at
 * all — `"."` tokenizes to a single, non-empty `["."]` token that still names no word, which
 * Java's narrower "list is empty" predicate would (wrongly, for this port) call acceptable.
 */
const WORD_CHARACTER = /[\p{L}\p{N}]/u;

function mustBeRejected(identifier: string): boolean {
  return identifier.trim() === "" || !WORD_CHARACTER.test(tokenize(identifier).join(""));
}

function assertNormalizesOrRejects(identifier: string, label: string): void {
  if (mustBeRejected(identifier)) {
    expect(() => normalizePhrase(identifier), label).toThrow(TypeError);
    expect(() => methodCandidates(identifier), label).toThrow(TypeError);
    return;
  }
  expect(() => {
    normalizePhrase(identifier);
    methodCandidates(identifier);
    parameterCandidate(identifier);
    classCandidate(identifier);
    exceptionCandidate(identifier);
  }, label).not.toThrow();
}

describe("clarity and glossary scanners", () => {
  test("every corpus string survives every scorer", () => {
    for (const hostile of hostileStrings()) {
      assertScoresAreUsable(hostile.value, hostile.id);
    }
  });

  test("every corpus string leaves the term normalizer with a declared outcome", () => {
    for (const hostile of hostileStrings()) {
      assertNormalizesOrRejects(hostile.value, `${hostile.id}: ${hostile.description}`);
    }
  });

  test("a trace of hostile identifiers produces a parseable clarity report", () => {
    for (const hostile of hostileStrings()) {
      const tree = treeNamed(hostile.value);
      const result = withinBudget(`clarity ${hostile.id}`, () => analyzeClarity(tree));

      expect(result.overall, hostile.id).toBeGreaterThanOrEqual(0);
      expect(result.overall, hostile.id).toBeLessThanOrEqual(1);
      const json = exportClarityJson(result, { scenario: hostile.id });
      expect(() => parseJson(`clarity-json for ${hostile.id}`, json)).not.toThrow();
      expect(renderClarityReport([{ scenario: hostile.id, result }])).not.toBeNull();
    }
  });

  test("a trace of hostile identifiers survives glossary harvest", () => {
    for (const hostile of hostileStrings()) {
      const trees = [treeNamed(hostile.value)];
      expect(
        () => harvestTraces(EMPTY_GLOSSARY, trees, CONSTANT_CONTEXT),
        `${hostile.id}: ${hostile.description}`,
      ).not.toThrow();
      expect(
        () => harvestStatic(EMPTY_GLOSSARY, trees, CONSTANT_CONTEXT),
        `${hostile.id}: ${hostile.description}`,
      ).not.toThrow();
    }
  });

  test("any identifier scores inside the unit range", () => {
    fc.assert(
      fc.property(identifiersArb(), (identifier) => {
        assertScoresAreUsable(identifier, "generated");
      }),
      { numRuns: 250 },
    );
  });

  test("tokenizing never throws and never returns null", () => {
    fc.assert(
      fc.property(identifiersArb(), (identifier) => {
        expect(tokenize(identifier)).not.toBeNull();
      }),
      { numRuns: 250 },
    );
  });

  test("scoring is deterministic", () => {
    fc.assert(
      fc.property(identifiersArb(), (identifier) => {
        expect(scoreMethodName(identifier)).toBe(scoreMethodName(identifier));
        expect(scoreClassName(identifier)).toBe(scoreClassName(identifier));
        expect(scoreParameterName(identifier)).toBe(scoreParameterName(identifier));
      }),
      { numRuns: 150 },
    );
  });

  test("a trace of generated identifiers produces a clarity score", () => {
    fc.assert(
      fc.property(identifiersArb(), (identifier) => {
        const result = analyzeClarity(treeNamed(identifier));
        expect(result.overall).toBeGreaterThanOrEqual(0);
        expect(result.overall).toBeLessThanOrEqual(1);
      }),
      { numRuns: 100 },
    );
  });

  test("a trace of generated identifiers survives glossary harvest", () => {
    fc.assert(
      fc.property(identifiersArb(), (identifier) => {
        const trees = [treeNamed(identifier)];
        expect(() => harvestTraces(EMPTY_GLOSSARY, trees, CONSTANT_CONTEXT)).not.toThrow();
      }),
      { numRuns: 100 },
    );
  });

  test("normalizing only ever throws its declared guard", () => {
    fc.assert(
      fc.property(identifiersArb(), (identifier) => {
        assertNormalizesOrRejects(identifier, "generated identifier");
      }),
      { numRuns: 100 },
    );
  });
});

/** The shapes bytecode/bundlers actually produce, not the shapes a hand-written identifier has. */
function identifiersArb(): fc.Arbitrary<string> {
  const alphabet = fc.constantFrom(
    "a",
    "Z",
    "0",
    "9",
    "_",
    "$",
    "<",
    ">",
    ".",
    "-",
    " ",
    "get",
    "set",
    "is",
    "Service",
    "lambda",
    "init",
    "clinit",
    "anonfun",
    "é",
    "你",
    "🙈",
    "\n",
    String.fromCodePoint(0x200b),
    String.fromCodePoint(0x0000),
  );
  return fc.array(alphabet, { maxLength: 20 }).map((parts) => parts.join(""));
}
