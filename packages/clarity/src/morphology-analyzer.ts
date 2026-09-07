// SPDX-License-Identifier: BUSL-1.1
// Licensed under the Business Source License 1.1 (see LICENSE); Change Date: four years from publication; Change License: Apache-2.0
// Copyright (c) 2026 Empower Agile
export type PartOfSpeech = "noun" | "verb" | "adjective" | "unknown";

const NOUN_SUFFIXES = [
  "tion",
  "sion",
  "ment",
  "ness",
  "ity",
  "ance",
  "ence",
  "er",
  "or",
  "ist",
  "ism",
];
const VERB_SUFFIXES = ["ate", "ify", "ize", "ise"];
const ADJECTIVE_SUFFIXES = ["able", "ible", "ful", "less", "ous", "ive"];

function matchesSuffix(token: string, suffixes: readonly string[]): boolean {
  return suffixes.some((s) => token.length > s.length && token.endsWith(s));
}

export function analyzeMorphology(token: string): PartOfSpeech {
  const lower = token.toLowerCase();
  if (lower.length < 3) return "unknown";
  if (matchesSuffix(lower, NOUN_SUFFIXES)) return "noun";
  if (matchesSuffix(lower, VERB_SUFFIXES)) return "verb";
  if (matchesSuffix(lower, ADJECTIVE_SUFFIXES)) return "adjective";
  return "unknown";
}
