// SPDX-License-Identifier: BUSL-1.1
// Licensed under the Business Source License 1.1 (see LICENSE); Change Date: four years from publication; Change License: Apache-2.0
// Copyright (c) 2026 Empower Agile
import { type TraceNode, type TraceTree, walkPreOrder } from "@narrativetrace/core";
import { scoreClassName } from "./class-name-scorer.js";
import { scoreCohesion } from "./cohesion-scorer.js";
import { preferredVerbs } from "./collocation-dictionary.js";
import { type DomainVocabulary, emptyVocabulary } from "./domain-vocabulary.js";
import { tokenize } from "./identifier-tokenizer.js";
import { scoreMethodName } from "./method-name-scorer.js";
import { scoreParameterName } from "./parameter-name-scorer.js";
import { scoreStructural } from "./structural-scorer.js";

/** Severity, upper-cased to match Java's cross-language `clarity-results.json` contract. */
export type ClaritySeverity = "HIGH" | "MEDIUM" | "LOW";

const SEVERITY_WEIGHT: Record<ClaritySeverity, number> = { HIGH: 3, MEDIUM: 2, LOW: 1 };

/**
 * One actionable naming issue (Java `ClarityIssue` parity). `impactScore` = severity weight ×
 * occurrences drives ranking; dedup groups by `category|element` summing occurrences.
 */
export type ClarityIssue = {
  readonly category: string;
  readonly element: string;
  readonly suggestion: string;
  readonly severity: ClaritySeverity;
  readonly occurrences: number;
  readonly impactScore: number;
};

// Score bands (Java HIGH ≤0.20, MEDIUM ≤0.50); anything above 0.50 is not flagged as an issue.
const HIGH_SEVERITY_THRESHOLD = 0.2;
const MEDIUM_SEVERITY_THRESHOLD = 0.5;

function classifySeverity(score: number): ClaritySeverity {
  if (score <= HIGH_SEVERITY_THRESHOLD) return "HIGH";
  if (score <= MEDIUM_SEVERITY_THRESHOLD) return "MEDIUM";
  return "LOW";
}

function issue(
  category: string,
  element: string,
  suggestion: string,
  severity: ClaritySeverity,
): ClarityIssue {
  return {
    category,
    element,
    suggestion,
    severity,
    occurrences: 1,
    impactScore: SEVERITY_WEIGHT[severity],
  };
}

export type ClarityResult = {
  readonly overall: number;
  readonly method: number;
  readonly class: number;
  readonly parameter: number;
  readonly structural: number;
  readonly cohesion: number;
  readonly issues: readonly ClarityIssue[];
};

const WEIGHTS = {
  method: 0.3,
  class: 0.2,
  parameter: 0.25,
  structural: 0.15,
  cohesion: 0.1,
};

type NodeInfo = {
  className: string;
  methodName: string;
  paramNames: string[];
  paramCount: number;
  depth: number;
};

// Bounded and cycle-safe (walkPreOrder) — a hand-built or deserialized tree can hold an ancestor.
// Depth is threaded through a side-channel map, seeded the moment the walk asks for a node's
// children — always before that child's own visit — since walkPreOrder only reports the node
// itself, not its position.
function collectNodes(roots: readonly TraceNode[], baseDepth: number, result: NodeInfo[]): void {
  const depthOf = new Map<TraceNode, number>();
  const childrenOf = (node: TraceNode): readonly TraceNode[] => {
    const depth = depthOf.get(node) ?? baseDepth;
    for (const child of node.children) depthOf.set(child, depth + 1);
    return node.children;
  };
  walkPreOrder(roots, childrenOf, (node) => {
    result.push({
      className: node.signature.className,
      methodName: node.signature.methodName,
      paramNames: node.signature.parameters.map((p) => p.name),
      paramCount: node.signature.parameters.length,
      depth: depthOf.get(node) ?? baseDepth,
    });
  });
}

function average(values: number[]): number {
  return values.reduce((a, b) => a + b, 0) / values.length;
}

type DimensionScores = {
  method: number;
  class: number;
  parameter: number;
  structural: number;
  cohesion: number;
};

function groupMethodsByClass(infos: NodeInfo[]): Map<string, string[]> {
  const classMethods = new Map<string, string[]>();
  for (const info of infos) {
    const methods = classMethods.get(info.className) ?? [];
    methods.push(info.methodName);
    classMethods.set(info.className, methods);
  }
  return classMethods;
}

function scoreUniqueClasses(infos: NodeInfo[], vocabulary: DomainVocabulary): number {
  const unique = [...new Set(infos.map((i) => i.className))];
  return average(unique.map((name) => scoreClassName(name, vocabulary)));
}

function scoreCohesionByClass(classMethods: Map<string, string[]>): number {
  return average([...classMethods.entries()].map(([cls, methods]) => scoreCohesion(methods, cls)));
}

function computeScores(infos: NodeInfo[], vocabulary: DomainVocabulary): DimensionScores {
  const method = average(infos.map((i) => scoreMethodName(i.methodName, vocabulary)));
  const cls = scoreUniqueClasses(infos, vocabulary);
  const allParamScores = infos.flatMap((i) =>
    i.paramNames.map((p) => scoreParameterName(p, vocabulary)),
  );
  const parameter = allParamScores.length > 0 ? average(allParamScores) : 1.0;
  // Java parity: a single global-max penalty from the worst param count + deepest node, not a
  // per-node average (which would dilute one bad frame across a large clean trace).
  const maxParamCount = Math.max(...infos.map((i) => i.paramCount));
  const maxDepth = Math.max(...infos.map((i) => i.depth));
  const structural = scoreStructural({ paramCount: maxParamCount, depth: maxDepth });
  const cohesion = scoreCohesionByClass(groupMethodsByClass(infos));
  return { method, class: cls, parameter, structural, cohesion };
}

function computeOverall(scores: DimensionScores): number {
  return Object.keys(WEIGHTS).reduce(
    (sum, key) => sum + scores[key as keyof DimensionScores] * WEIGHTS[key as keyof typeof WEIGHTS],
    0,
  );
}

const METHOD_SUGGESTION =
  "Use a domain-specific verb+noun (e.g., calculateTotal, reserveInventory)";
const CLASS_SUGGESTION =
  "Use a domain-specific name or a recognized pattern suffix (e.g., OrderService, PaymentGateway)";
const PARAM_SUGGESTION = "Use a domain-specific name (e.g., customerId, orderAmount)";

function findMethodNameIssues(infos: NodeInfo[], vocabulary: DomainVocabulary): ClarityIssue[] {
  const issues: ClarityIssue[] = [];
  for (const info of infos) {
    const score = scoreMethodName(info.methodName, vocabulary);
    if (score < MEDIUM_SEVERITY_THRESHOLD) {
      const element = `${info.className}.${info.methodName}`;
      issues.push(issue("method-name", element, METHOD_SUGGESTION, classifySeverity(score)));
    }
  }
  return issues;
}

function findClassNameIssues(infos: NodeInfo[], vocabulary: DomainVocabulary): ClarityIssue[] {
  const issues: ClarityIssue[] = [];
  const seen = new Set<string>();
  for (const info of infos) {
    if (!seen.has(info.className)) {
      seen.add(info.className);
      const score = scoreClassName(info.className, vocabulary);
      if (score < MEDIUM_SEVERITY_THRESHOLD) {
        issues.push(issue("class-name", info.className, CLASS_SUGGESTION, classifySeverity(score)));
      }
    }
  }
  return issues;
}

function findParamNameIssues(infos: NodeInfo[], vocabulary: DomainVocabulary): ClarityIssue[] {
  const issues: ClarityIssue[] = [];
  for (const info of infos) {
    for (const param of info.paramNames) {
      const score = scoreParameterName(param, vocabulary);
      if (score < MEDIUM_SEVERITY_THRESHOLD) {
        issues.push(issue("param-name", param, PARAM_SUGGESTION, classifySeverity(score)));
      }
    }
  }
  return issues;
}

function findCollocationIssues(infos: NodeInfo[]): ClarityIssue[] {
  const issues: ClarityIssue[] = [];
  for (const info of infos) {
    const tokens = tokenize(info.methodName);
    if (tokens.length < 2) continue;
    const verb = (tokens[0] as string).toLowerCase();
    const noun = (tokens[tokens.length - 1] as string).toLowerCase();
    const preferred = preferredVerbs(noun);
    if (preferred.size === 0 || preferred.has(verb)) continue;
    const capitalNoun = noun.charAt(0).toUpperCase() + noun.slice(1);
    const suggestion = `Consider: ${[...preferred]
      .sort()
      .map((v) => v + capitalNoun)
      .join(", ")}`;
    const element = `${info.className}.${info.methodName}`;
    issues.push(issue("collocation", element, suggestion, "LOW"));
  }
  return issues;
}

/** Groups by `category|element`, summing occurrences, then ranks by impactScore descending. */
function deduplicateAndRank(issues: ClarityIssue[]): ClarityIssue[] {
  const groups = new Map<string, ClarityIssue[]>();
  for (const iss of issues) {
    const key = `${iss.category}|${iss.element}`;
    const group = groups.get(key) ?? [];
    group.push(iss);
    groups.set(key, group);
  }
  return [...groups.values()]
    .map((group) => {
      const first = group[0] as ClarityIssue;
      const occurrences = group.length;
      return { ...first, occurrences, impactScore: SEVERITY_WEIGHT[first.severity] * occurrences };
    })
    .sort((a, b) => b.impactScore - a.impactScore);
}

function collectIssues(infos: NodeInfo[], vocabulary: DomainVocabulary): ClarityIssue[] {
  const all = [
    ...findMethodNameIssues(infos, vocabulary),
    ...findClassNameIssues(infos, vocabulary),
    ...findParamNameIssues(infos, vocabulary),
    ...findCollocationIssues(infos),
  ];
  return deduplicateAndRank(all);
}

// Java parity: an empty trace is not all-zeros. Absent params default to a perfect 1.0, structural
// has no penalty (1.0), and cohesion falls back to the unknown-role 0.7 — yielding overall 0.47.
const EMPTY_RESULT: ClarityResult = {
  overall: WEIGHTS.parameter + WEIGHTS.structural + 0.7 * WEIGHTS.cohesion,
  method: 0,
  class: 0,
  parameter: 1.0,
  structural: 1.0,
  cohesion: 0.7,
  issues: [],
};

/**
 * Scores one trace tree.
 *
 * @param tree - the captured trace to score
 * @param vocabulary - the project's committed glossary vocabulary (ADR-012), which extends every
 *   built-in dictionary without overriding any of them; omit it to score with the built-in
 *   dictionaries alone, which is what a project with no glossary gets
 */
export function analyzeClarity(
  tree: TraceTree,
  vocabulary: DomainVocabulary = emptyVocabulary,
): ClarityResult {
  const infos: NodeInfo[] = [];
  collectNodes(tree.roots, 1, infos);

  if (infos.length === 0) return EMPTY_RESULT;

  const scores = computeScores(infos, vocabulary);
  const overall = computeOverall(scores);
  const issues = collectIssues(infos, vocabulary);

  return { overall, ...scores, issues };
}
