// SPDX-License-Identifier: BUSL-1.1
// Licensed under the Business Source License 1.1 (see LICENSE); Change Date: four years from publication; Change License: Apache-2.0
// Copyright (c) 2026 Empower Agile
import { expect, test } from "vitest";
import { abbreviationDictionaryMetrics } from "../src/abbreviation-dictionary.js";
import { collocationDictionaryMetrics } from "../src/collocation-dictionary.js";
import { roleSuffixDictionaryMetrics } from "../src/role-suffix-dictionary.js";
import { verbDictionaryMetrics } from "../src/verb-dictionary.js";

test("dictionary sizes stay above guardrails", () => {
  const abbreviationCount = abbreviationDictionaryMetrics().abbreviationCount;
  const collocationNounCount = collocationDictionaryMetrics().nounCount;
  const roleExpectationCount = roleSuffixDictionaryMetrics().suffixCount;
  const metrics = verbDictionaryMetrics();

  expect(abbreviationCount).toBeGreaterThanOrEqual(150);
  expect(collocationNounCount).toBeGreaterThanOrEqual(180);
  expect(roleExpectationCount).toBeGreaterThanOrEqual(25);
  // Java parity: 828 domain (+ derived), 197 standard, 21 generic, 17 boolean prefixes.
  expect(metrics.domainVerbCount).toBeGreaterThanOrEqual(828);
  expect(metrics.standardVerbCount).toBeGreaterThanOrEqual(197);
  expect(metrics.genericVerbCount).toBe(21);
  expect(metrics.booleanPrefixCount).toBe(17);
});

test("reports current dictionary metrics", () => {
  const abbreviationCount = abbreviationDictionaryMetrics().abbreviationCount;
  const collocationNounCount = collocationDictionaryMetrics().nounCount;
  const roleExpectationCount = roleSuffixDictionaryMetrics().suffixCount;
  const domainVerbCount = verbDictionaryMetrics().domainVerbCount;

  const summary =
    `Dictionary metrics: abbreviations=${abbreviationCount} ` +
    `collocationNouns=${collocationNounCount} ` +
    `roleExpectations=${roleExpectationCount} ` +
    `domainVerbs=${domainVerbCount}`;

  expect(summary).toContain("Dictionary metrics:");
  console.log(summary);
});
