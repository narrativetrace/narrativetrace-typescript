// SPDX-License-Identifier: BUSL-1.1
// Licensed under the Business Source License 1.1 (see LICENSE); Change Date: four years from publication; Change License: Apache-2.0
// Copyright (c) 2026 Empower Agile
import { abbreviationScore, classifyAbbreviation } from "./abbreviation-dictionary.js";
import { type DomainVocabulary, emptyVocabulary } from "./domain-vocabulary.js";
import { classifyToken, tokenTierScore } from "./generic-token-detector.js";
import { tokenize } from "./identifier-tokenizer.js";
import { analyzeMorphology } from "./morphology-analyzer.js";
import { classifyRoleSuffix } from "./role-suffix-dictionary.js";

function scoreSuffix(suffix: string): number {
  const category = classifyRoleSuffix(suffix);
  switch (category) {
    case "designPattern":
    case "functional":
      return 1.0;
    case "generic":
      return 0.3;
    default:
      return 0.6;
  }
}

function scorePrefixQuality(prefixTokens: readonly string[], vocabulary: DomainVocabulary): number {
  if (prefixTokens.length === 0) return 0.3;
  const scores = prefixTokens.map((t) => tokenTierScore(classifyToken(t, vocabulary)));
  return scores.reduce((a, b) => a + b, 0) / scores.length;
}

function scoreAbbreviations(tokens: readonly string[], vocabulary: DomainVocabulary): number {
  if (tokens.length === 0) return 1.0;
  let total = 0;
  for (const token of tokens) {
    const tier = classifyAbbreviation(token, vocabulary);
    total += tier !== undefined ? abbreviationScore(tier) : 1.0;
  }
  return total / tokens.length;
}

function scoreTokenCount(count: number): number {
  if (count >= 2 && count <= 3) return 1.0;
  if (count === 1) return 0.4;
  if (count === 4) return 0.7;
  return 0.5;
}

function scoreMorphology(suffix: string): number {
  return analyzeMorphology(suffix) === "noun" ? 1.0 : 0.6;
}

/**
 * Scores one class name; `vocabulary` is the project's committed glossary vocabulary, which
 * extends every dictionary consulted here without overriding any of them.
 */
export function scoreClassName(
  className: string,
  vocabulary: DomainVocabulary = emptyVocabulary,
): number {
  const tokens = tokenize(className);
  if (tokens.length === 0) return 0;

  const suffix = tokens[tokens.length - 1] as string;
  const prefix = tokens.slice(0, -1);

  return (
    scoreSuffix(suffix) * 0.5 +
    scorePrefixQuality(prefix, vocabulary) * 0.2 +
    scoreAbbreviations(prefix, vocabulary) * 0.1 +
    scoreTokenCount(tokens.length) * 0.1 +
    scoreMorphology(suffix) * 0.1
  );
}
