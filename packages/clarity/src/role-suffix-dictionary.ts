// SPDX-License-Identifier: BUSL-1.1
// Licensed under the Business Source License 1.1 (see LICENSE); Change Date: four years from publication; Change License: Apache-2.0
// Copyright (c) 2026 Empower Agile
export type RoleSuffixCategory = "designPattern" | "functional" | "generic" | "unknown";

const DESIGN_PATTERN_SUFFIXES = new Set([
  "service",
  "repository",
  "controller",
  "factory",
  "builder",
  "strategy",
  "observer",
  "adapter",
  "decorator",
  "visitor",
  "command",
  "facade",
  "proxy",
  "gateway",
  "client",
]);

const FUNCTIONAL_SUFFIXES = new Set([
  "validator",
  "converter",
  "mapper",
  "resolver",
  "provider",
  "listener",
  "interceptor",
  "filter",
  "scheduler",
  "dispatcher",
  "router",
  "registry",
  "store",
  "cache",
  "engine",
  "renderer",
  "executor",
  "analyzer",
  "scanner",
  "parser",
  "formatter",
  "encoder",
  "decoder",
  "serializer",
  "loader",
  "exporter",
  "importer",
  "inspector",
  "monitor",
  "notifier",
  "publisher",
  "consumer",
  "producer",
  "transformer",
  "translator",
  "generator",
  "authenticator",
  "authorizer",
  "coordinator",
  "aggregator",
  "orchestrator",
  "middleware",
  "evaluator",
  "ranker",
  "reranker",
  "normalizer",
  "enricher",
  "redactor",
  "guard",
  "policy",
]);

const GENERIC_SUFFIXES = new Set([
  "manager",
  "handler",
  "processor",
  "helper",
  "utility",
  "utils",
  "util",
  "common",
  "base",
  "default",
  "data",
  "info",
  "impl",
]);

// Java parity (RoleSuffixDictionary.EXPECTED_VERBS): the exact per-role verb expectations the
// CohesionScorer aligns against, since cohesion scores are a cross-language contract. `service` is
// deliberately empty — a Service is an unconstrained broad role (scores 0.9 via classify, not a
// verb ratio); roles absent here (handler, adapter, provider, …) also fall through to the broad/
// unknown envelope by their suffix category. Do not "enrich" these lists without matching Java.
const ROLE_VERBS: ReadonlyMap<string, ReadonlySet<string>> = new Map([
  ["repository", new Set(["find", "save", "delete", "exists", "count", "get"])],
  ["factory", new Set(["create", "build", "make", "of", "from", "new"])],
  ["builder", new Set(["create", "build", "make", "of", "from", "with", "set", "add"])],
  ["validator", new Set(["validate", "check", "verify", "ensure", "is"])],
  ["converter", new Set(["convert", "transform", "map", "to", "from"])],
  ["mapper", new Set(["map", "convert", "transform", "to", "from"])],
  ["parser", new Set(["parse", "read", "extract", "tokenize"])],
  ["formatter", new Set(["format", "render", "display", "print"])],
  ["renderer", new Set(["render", "display", "format", "draw"])],
  ["scheduler", new Set(["schedule", "cancel", "reschedule", "delay"])],
  ["dispatcher", new Set(["dispatch", "send", "route", "forward"])],
  ["filter", new Set(["filter", "accept", "reject", "matches", "test"])],
  ["listener", new Set(["on", "handle", "receive", "process"])],
  ["orchestrator", new Set(["start", "advance", "pause", "resume", "cancel", "complete"])],
  ["middleware", new Set(["intercept", "wrap", "authorize", "validate", "forward"])],
  ["evaluator", new Set(["evaluate", "score", "compare", "rank"])],
  ["ranker", new Set(["rank", "score", "sort", "rerank"])],
  ["reranker", new Set(["rerank", "score", "sort", "rank"])],
  ["normalizer", new Set(["normalize", "standardize", "cleanse", "transform"])],
  ["enricher", new Set(["enrich", "augment", "hydrate", "join"])],
  ["redactor", new Set(["redact", "sanitize", "mask", "scrub"])],
  ["guard", new Set(["validate", "enforce", "block", "allow"])],
  ["policy", new Set(["evaluate", "enforce", "apply", "override"])],
  ["controller", new Set(["create", "read", "update", "delete", "list", "get", "find", "save"])],
  ["service", new Set<string>()],
  ["gateway", new Set(["send", "receive", "connect", "disconnect", "forward"])],
  ["cache", new Set(["get", "put", "evict", "invalidate", "contains", "clear"])],
  ["store", new Set(["get", "put", "save", "delete", "find", "contains", "clear"])],
  ["registry", new Set(["register", "unregister", "lookup", "find", "get", "contains"])],
]);

export function classifyRoleSuffix(suffix: string): RoleSuffixCategory {
  const lower = suffix.toLowerCase();
  if (DESIGN_PATTERN_SUFFIXES.has(lower)) return "designPattern";
  if (FUNCTIONAL_SUFFIXES.has(lower)) return "functional";
  if (GENERIC_SUFFIXES.has(lower)) return "generic";
  return "unknown";
}

export function expectedVerbsForRole(suffix: string): ReadonlySet<string> | undefined {
  return ROLE_VERBS.get(suffix.toLowerCase());
}

export function allRoleSuffixes(): readonly string[] {
  return [...ROLE_VERBS.keys()];
}

export function allRoleExpectedVerbs(): readonly string[] {
  return [...ROLE_VERBS.values()].flatMap((verbs) => [...verbs.values()]);
}

export function roleSuffixDictionaryMetrics(): {
  suffixCount: number;
  expectedVerbCount: number;
} {
  return {
    suffixCount: ROLE_VERBS.size,
    expectedVerbCount: allRoleExpectedVerbs().length,
  };
}
