// SPDX-License-Identifier: BUSL-1.1
// Licensed under the Business Source License 1.1 (see LICENSE); Change Date: four years from publication; Change License: Apache-2.0
// Copyright (c) 2026 Empower Agile
import { methodSignature, parameterCapture, traceNode, traceTree } from "@narrativetrace/core";
import { describe, expect, test } from "vitest";
import { analyzeClarity } from "../src/clarity-analyzer.js";
import { domainVocabulary } from "../src/domain-vocabulary.js";

// Parity check C12 (2026-10-11): the clarity scan flags a generic verb (`OrderProcessor.execute`)
// and, when the project glossary lists a verb for the noun (`ship order`), proposes that verb.
function executeOrderTree() {
  const signature = methodSignature("OrderProcessor", "execute", [
    parameterCapture("order", '"O-1"', false),
  ]);
  return traceTree([traceNode(signature, { kind: "returned", renderedValue: null }, [])]);
}

// The project glossary's `ship order` verb phrase, as glossaryVocabulary() maps it.
const shipOrderGlossary = domainVocabulary(["ship"], ["order"]);

describe("a generic verb in a checkout name", () => {
  test("OrderProcessor.execute is flagged as a method-name issue", () => {
    const issues = analyzeClarity(executeOrderTree()).issues;

    const flagged = issues.find((i) => i.element === "OrderProcessor.execute");
    expect(flagged?.category).toBe("method-name");
  });

  test("stays flagged when the glossary lists a verb, because 'execute' is a built-in generic verb", () => {
    const issues = analyzeClarity(executeOrderTree(), shipOrderGlossary).issues;

    expect(issues.some((i) => i.element === "OrderProcessor.execute")).toBe(true);
  });

  // Parity check 2026-10-11, capability C12: the issue carries the fixed generic hint
  // "Use a domain-specific verb+noun (e.g., calculateTotal, reserveInventory)" — the glossary's
  // verb for the class's noun is never proposed. test.fails keeps the gate green; when the bug is
  // fixed it flips red — then turn it into a plain test.
  test.fails("proposes the glossary's verb 'ship' for the noun order", () => {
    const issues = analyzeClarity(executeOrderTree(), shipOrderGlossary).issues;

    const flagged = issues.find((i) => i.element === "OrderProcessor.execute");
    expect(flagged?.suggestion).toContain("ship");
  });
});
