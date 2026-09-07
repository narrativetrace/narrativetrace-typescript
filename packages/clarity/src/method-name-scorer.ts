// SPDX-License-Identifier: BUSL-1.1
// Licensed under the Business Source License 1.1 (see LICENSE); Change Date: four years from publication; Change License: Apache-2.0
// Copyright (c) 2026 Empower Agile
import { abbreviationScore, classifyAbbreviation } from "./abbreviation-dictionary.js";
import { type DomainVocabulary, emptyVocabulary } from "./domain-vocabulary.js";
import { classifyToken, tokenTierScore } from "./generic-token-detector.js";
import { tokenize } from "./identifier-tokenizer.js";
import { analyzeMorphology } from "./morphology-analyzer.js";
import { classifyVerb } from "./verb-dictionary.js";

const verbScores: Record<string, number> = {
  domain: 1.0,
  standard: 0.8,
  boolean: 0.7,
  unknown: 0.3,
  generic: 0.3,
};

function scoreVerb(verb: string, vocabulary: DomainVocabulary): number {
  const category = classifyVerb(verb, vocabulary);
  return verbScores[category] as number;
}

function scoreTokenSpecificity(
  nounTokens: readonly string[],
  vocabulary: DomainVocabulary,
): number {
  if (nounTokens.length === 0) return 0.3;
  const scores = nounTokens.map((t) => tokenTierScore(classifyToken(t, vocabulary)));
  return scores.reduce((a, b) => a + b, 0) / scores.length;
}

function scoreAbbreviations(tokens: readonly string[], vocabulary: DomainVocabulary): number {
  let total = 0;
  for (const token of tokens) {
    const tier = classifyAbbreviation(token, vocabulary);
    total += tier !== undefined ? abbreviationScore(tier) : 1.0;
  }
  return total / tokens.length;
}

function scoreTokenCount(count: number): number {
  if (count >= 2 && count <= 3) return 1.0;
  if (count === 1) return 0.3;
  if (count === 4) return 0.7;
  return 0.5;
}

function scoreMorphology(nounTokens: readonly string[]): number {
  if (nounTokens.length === 0) return 0.5;
  let nounCount = 0;
  for (const t of nounTokens) {
    if (analyzeMorphology(t) === "noun") nounCount++;
  }
  return 0.5 + 0.5 * (nounCount / nounTokens.length);
}

/**
 * Scores one method name; `vocabulary` is the project's committed glossary vocabulary, which
 * extends every dictionary consulted here without overriding any of them.
 */
export function scoreMethodName(
  methodName: string,
  vocabulary: DomainVocabulary = emptyVocabulary,
): number {
  const tokens = tokenize(methodName);
  if (tokens.length === 0) return 0;

  const verb = tokens[0] as string;
  const nounTokens = tokens.slice(1);

  return (
    scoreVerb(verb, vocabulary) * 0.45 +
    scoreTokenSpecificity(nounTokens, vocabulary) * 0.15 +
    scoreAbbreviations(tokens, vocabulary) * 0.1 +
    scoreTokenCount(tokens.length) * 0.15 +
    scoreMorphology(nounTokens) * 0.15
  );
}
