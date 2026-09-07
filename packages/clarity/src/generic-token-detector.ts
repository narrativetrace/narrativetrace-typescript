// SPDX-License-Identifier: BUSL-1.1
// Licensed under the Business Source License 1.1 (see LICENSE); Change Date: four years from publication; Change License: Apache-2.0
// Copyright (c) 2026 Empower Agile
import {
  type DomainVocabulary,
  emptyVocabulary,
  isDomainNoun as vocabularyHasNoun,
} from "./domain-vocabulary.js";

export type TokenTier = "domain" | "standard" | "vague" | "meaningless";

const MEANINGLESS = new Set([
  "a",
  "b",
  "c",
  "d",
  "e",
  "f",
  "x",
  "y",
  "z",
  "i",
  "j",
  "k",
  "n",
  "m",
  "p",
  "q",
  "t",
  "tmp",
  "temp",
  "foo",
  "bar",
  "baz",
  "qux",
  "todo",
  "fixme",
]);

const VAGUE = new Set([
  "data",
  "info",
  "item",
  "value",
  "object",
  "thing",
  "stuff",
  "result",
  "output",
  "input",
  "param",
  "arg",
  "element",
  "entity",
  "record",
  "entry",
  "detail",
  "content",
  "payload",
  "meta",
  "metadata",
  "blob",
  "document",
  "artifact",
  "messagebody",
  "dataset",
  "modeloutput",
  "modelinput",
]);

const STANDARD = new Set([
  "name",
  "type",
  "status",
  "count",
  "size",
  "length",
  "list",
  "map",
  "set",
  "key",
  "index",
  "id",
  "flag",
  "mode",
  "state",
  "level",
  "code",
  "label",
  "path",
  "file",
  "dir",
  "port",
  "host",
  "uri",
  "endpoint",
  "topic",
  "channel",
  "session",
  "token",
  "trace",
  "metric",
  "tenant",
  "url",
  "date",
  "time",
  "start",
  "end",
  "min",
  "max",
  "total",
  "sum",
  "average",
  "limit",
  "offset",
  "page",
]);

const TIER_SCORES: Record<TokenTier, number> = {
  domain: 1.0,
  standard: 0.8,
  vague: 0.4,
  meaningless: 0.1,
};

/**
 * Classifies one identifier token by how much meaning it carries.
 *
 * @remarks Meaningless placeholders are decided first, so committing `temp` or `foo` to a glossary
 * cannot make them meaningful. Every other tier yields to the project: a declared noun is domain
 * vocabulary by definition.
 */
export function classifyToken(
  token: string,
  vocabulary: DomainVocabulary = emptyVocabulary,
): TokenTier {
  const lower = token.toLowerCase();
  if (lower === "" || MEANINGLESS.has(lower)) return "meaningless";
  if (vocabularyHasNoun(vocabulary, lower)) return "domain";
  if (VAGUE.has(lower)) return "vague";
  if (STANDARD.has(lower)) return "standard";
  return "domain";
}

export function tokenTierScore(tier: TokenTier): number {
  return TIER_SCORES[tier];
}
