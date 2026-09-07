// SPDX-License-Identifier: BUSL-1.1
// Licensed under the Business Source License 1.1 (see LICENSE); Change Date: four years from publication; Change License: Apache-2.0
// Copyright (c) 2026 Empower Agile
import { tokenize } from "./identifier-tokenizer.js";
import { classifyRoleSuffix, expectedVerbsForRole } from "./role-suffix-dictionary.js";

// Java parity (CohesionScorer): a class with a recognized-but-unconstrained suffix (Service,
// Strategy, …) scores BROAD; an unrecognized suffix (Widget) scores UNKNOWN; an empty class name
// or empty method list also falls back to UNKNOWN.
const UNKNOWN_ROLE_SCORE = 0.7;
const BROAD_ROLE_SCORE = 0.9;

/** A method aligns when its first token starts with any expected verb (Java `String::startsWith`). */
function isAligned(methodName: string, expectedVerbs: ReadonlySet<string>): boolean {
  const first = tokenize(methodName)[0];
  if (first === undefined) return false;
  for (const verb of expectedVerbs) {
    if (first.startsWith(verb)) return true;
  }
  return false;
}

/**
 * Scores vocabulary consistency for one class against its role suffix (Java
 * `CohesionScorer.scoreClass`). Returns the ratio of methods whose verb aligns with the role's
 * expected verbs, or the broad/unknown envelope when the role has no verb expectations.
 */
export function scoreCohesion(methodNames: readonly string[], className?: string): number {
  const tokens = className ? tokenize(className) : [];
  if (tokens.length === 0) return UNKNOWN_ROLE_SCORE;

  const lastToken = tokens[tokens.length - 1] as string;
  const expectedVerbs = expectedVerbsForRole(lastToken);

  if (expectedVerbs === undefined || expectedVerbs.size === 0) {
    return classifyRoleSuffix(lastToken) === "unknown" ? UNKNOWN_ROLE_SCORE : BROAD_ROLE_SCORE;
  }

  if (methodNames.length === 0) return UNKNOWN_ROLE_SCORE;

  const aligned = methodNames.filter((m) => isAligned(m, expectedVerbs)).length;
  return aligned / methodNames.length;
}
