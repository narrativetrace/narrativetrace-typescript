// SPDX-License-Identifier: BUSL-1.1
// Licensed under the Business Source License 1.1 (see LICENSE); Change Date: four years from publication; Change License: Apache-2.0
// Copyright (c) 2026 Empower Agile
import { DiagramLabel } from "./diagram-label.js";

const LOWERCASE = /[a-z]/g;

// Candidates are derived from the class name first (initials, then a 2-char prefix) and only then
// sanitized to a grammar-safe token — an alias sits in grammar position on every arrow line, so a
// candidate carrying a space, a colon or an arrow fragment (`a->>b` yields the raw candidate `->`)
// must never reach the caller unsanitized. Collision detection below runs on this sanitized form,
// not the raw candidate, so two names that reduce to the same token (`A:` and `A;` both fold to
// `A`) are never handed out as the same alias without a numeric suffix.
function preferredAliases(className: string): string[] {
  const initials = className.replace(LOWERCASE, "");
  const prefix = className.slice(0, 2).toUpperCase();
  const candidates = initials.length >= 2 ? [initials.slice(0, 2), prefix] : [prefix];
  return candidates.map((c) => DiagramLabel.alias(c));
}

function nextNumberedAlias(prefix: string, used: Set<string>): string {
  let i = 2;
  while (used.has(`${prefix}${i}`)) i++;
  return `${prefix}${i}`;
}

export function generateAlias(className: string, existing: Map<string, string>): string {
  const used = new Set(existing.values());
  const preferred = preferredAliases(className || "Anon");
  return preferred.find((c) => !used.has(c)) ?? nextNumberedAlias(preferred.at(-1)!, used);
}
