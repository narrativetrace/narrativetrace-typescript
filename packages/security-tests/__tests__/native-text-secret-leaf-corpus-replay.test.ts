// SPDX-License-Identifier: BUSL-1.1
// Licensed under the Business Source License 1.1 (see LICENSE); Change Date: four years from publication; Change License: Apache-2.0
// Copyright (c) 2026 Empower Agile
import { renderStructured, renderValue } from "@narrativetrace/core";
import { describe, expect, test } from "vitest";
import { hostileGraphCases } from "../src/corpus/hostile-corpus.js";
import { build as buildGraph } from "../src/corpus/hostile-graphs.js";

// Corpus replay for the master row `native-text-secret-leaf` (the twin of Java's
// NativeTextSecretLeafCorpusReplayTest, B-206): a secret in a leaf's own text, with no field name
// or hook to match, renders as exactly the marker on BOTH rendering paths. The generic graph
// replay only asserts that a sentinel never appears; this pins the exact verdict per leaf.
const JWT_SHAPE = "eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiJhZGEifQ.c2lnbmF0dXJl";
const CARD_SHAPE = "4111111111111111";
const ROW = "native-text-secret-leaf";
const NAMES = [
  "URL with a signed-token text",
  "Date with a card-number text",
  "frozen leaf (the enum constant) with a signed-token text",
  "narrativeSummary() returning a signed-token shape",
  "bigint holding a card number",
];

function leaves(): unknown[] {
  const graphCase = hostileGraphCases().find((c) => c.id === ROW);
  if (graphCase === undefined) throw new Error(`no graphs.json row with id ${ROW}`);
  return buildGraph(graphCase, "unused-sentinel") as unknown[];
}

describe("native-text-secret-leaf, both paths", () => {
  test("the row has the five leaves", () => {
    expect(leaves()).toHaveLength(NAMES.length);
  });

  test.each(
    NAMES.map((name, index) => [name, index] as const),
  )("%s renders as exactly the marker", (_name, index) => {
    const leaf = leaves()[index];
    expect(renderValue(leaf)).toBe("[REDACTED]");
    // The structured path introspects state and never reads a platform leaf's native text or runs
    // a summary hook (an object of its type name, no fields), so its verdict for the first four is
    // "the secret is in no byte"; a bigint is a scalar it prints itself, so there it is the marker.
    const structured = JSON.stringify(renderStructured(leaf));
    expect(structured).not.toContain(JWT_SHAPE);
    expect(structured).not.toContain(CARD_SHAPE);
    if (typeof leaf === "bigint") expect(structured).toContain("[REDACTED]");
  });
});
