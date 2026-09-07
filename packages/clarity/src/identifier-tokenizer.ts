// SPDX-License-Identifier: BUSL-1.1
// Licensed under the Business Source License 1.1 (see LICENSE); Change Date: four years from publication; Change License: Apache-2.0
// Copyright (c) 2026 Empower Agile
export function tokenize(identifier: string): readonly string[] {
  if (identifier === "") return [];
  return identifier
    .replace(/_/g, "\0")
    .replace(/([a-zA-Z])(\d)/g, "$1\0$2")
    .replace(/(\d)([a-zA-Z])/g, "$1\0$2")
    .replace(/([a-z])([A-Z])/g, "$1\0$2")
    .replace(/([A-Z]+)([A-Z][a-z])/g, "$1\0$2")
    .split("\0")
    .filter((t) => t !== "")
    .map((t) => t.toLowerCase());
}
