// SPDX-License-Identifier: BUSL-1.1
// Licensed under the Business Source License 1.1 (see LICENSE); Change Date: four years from publication; Change License: Apache-2.0
// Copyright (c) 2026 Empower Agile
import { abbreviationScore, classifyAbbreviation } from "./abbreviation-dictionary.js";
import { type DomainVocabulary, emptyVocabulary } from "./domain-vocabulary.js";
import { classifyToken, tokenTierScore } from "./generic-token-detector.js";
import { tokenize } from "./identifier-tokenizer.js";

function scoreTokenQuality(tokens: readonly string[], vocabulary: DomainVocabulary): number {
  const scores = tokens.map((t) => tokenTierScore(classifyToken(t, vocabulary)));
  return scores.reduce((a, b) => a + b, 0) / scores.length;
}

function scoreAbbreviation(tokens: readonly string[], vocabulary: DomainVocabulary): number {
  let total = 0;
  for (const token of tokens) {
    const tier = classifyAbbreviation(token, vocabulary);
    total += tier !== undefined ? abbreviationScore(tier) : 1.0;
  }
  return total / tokens.length;
}

function scoreTokenCount(tokens: readonly string[], paramName: string): number {
  if (tokens.length > 1) return 1.0;
  if (paramName.length === 1) return 0.2;
  return 0.8;
}

/**
 * Scores one parameter name; `vocabulary` is the project's committed glossary vocabulary, which
 * extends both dictionaries consulted here without overriding either.
 */
export function scoreParameterName(
  paramName: string,
  vocabulary: DomainVocabulary = emptyVocabulary,
): number {
  if (paramName.length === 1) return 0;
  const tokens = tokenize(paramName);
  if (tokens.length === 0) return 0;

  return (
    scoreTokenQuality(tokens, vocabulary) * 0.5 +
    scoreAbbreviation(tokens, vocabulary) * 0.2 +
    scoreTokenCount(tokens, paramName) * 0.3
  );
}
