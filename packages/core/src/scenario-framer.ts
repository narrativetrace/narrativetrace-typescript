// SPDX-License-Identifier: BUSL-1.1
// Licensed under the Business Source License 1.1 (see LICENSE); Change Date: four years from publication; Change License: Apache-2.0
// Copyright (c) 2026 Empower Agile
/**
 * Humanizes a test name for use as a scenario label.
 * A trailing `(...)` argument suffix is stripped; an already-spaced name is assumed
 * human-readable and passes through verbatim; otherwise `test_`/`should_` prefixes are dropped,
 * underscores/camelCase become spaces, and the first letter is capitalized.
 *
 * DECISION PINNED: TS does NOT prepend Java's "Scenario: " — the markdown frontmatter key and
 * prose already supply that context, so a bare label avoids "scenario: Scenario: …" duplication.
 */
export function frameScenario(testName: string): string {
  const stripped = testName.replace(/\s*\([^)]*\)\s*$/, "").trim();
  // Already-spaced → treat as human-authored and pass through untouched (Java humanize).
  if (/\s/.test(stripped)) return stripped;
  const words = stripped
    .replace(/^(test_|should_)/, "")
    .replace(/_/g, " ")
    .replace(/([a-z])([A-Z])/g, "$1 $2")
    .toLowerCase()
    .trim();
  return words.charAt(0).toUpperCase() + words.slice(1);
}
