// SPDX-License-Identifier: BUSL-1.1
// Licensed under the Business Source License 1.1 (see LICENSE); Change Date: four years from publication; Change License: Apache-2.0
// Copyright (c) 2026 Empower Agile
const LOWERCASE = /[a-z]/g;

function preferredAliases(className: string): string[] {
  const initials = className.replace(LOWERCASE, "");
  const prefix = className.slice(0, 2).toUpperCase();
  return initials.length >= 2 ? [initials.slice(0, 2), prefix] : [prefix];
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
