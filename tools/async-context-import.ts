// SPDX-License-Identifier: BUSL-1.1
// Licensed under the Business Source License 1.1 (see LICENSE); Change Date: four years from publication; Change License: Apache-2.0
// Copyright (c) 2026 Empower Agile
import { readFileSync } from "node:fs";
import { relative } from "node:path";
import { publicDocuments } from "./public-documents.js";

/**
 * `AsyncNarrativeContext` is exported by `@narrativetrace/core-node` (it needs `node:async_hooks`);
 * `core` marks it `@internal` so the browser-safe package stays free of Node built-ins. A page
 * that imports it from `@narrativetrace/core` hands the reader — and the agent copying the
 * snippet — an import that does not resolve to the public symbol.
 *
 * Whole-text, not line-by-line: a named-import list may be wrapped over several lines. The module
 * specifier must end at the closing quote, so `@narrativetrace/core-node` never matches.
 */
const CORE_IMPORT_OF_ASYNC_CONTEXT =
  /import\s+(?:type\s+)?\{[^}]*\bAsyncNarrativeContext\b[^}]*\}\s*from\s*["']@narrativetrace\/core["']/g;

function lineOf(text: string, index: number): number {
  return text.slice(0, index).split("\n").length;
}

/** Every public document that imports `AsyncNarrativeContext` from `@narrativetrace/core`, as
 * `file:line: message`, sorted; empty when every snippet imports it from `core-node`. */
export function check(repoRoot: string): string[] {
  const problems: string[] = [];
  for (const file of publicDocuments(repoRoot)) {
    const text = readFileSync(file, "utf-8");
    for (const match of text.matchAll(CORE_IMPORT_OF_ASYNC_CONTEXT)) {
      problems.push(
        `${relative(repoRoot, file)}:${lineOf(text, match.index)}: AsyncNarrativeContext is ` +
          'exported by "@narrativetrace/core-node", not "@narrativetrace/core"',
      );
    }
  }
  return problems.sort();
}
