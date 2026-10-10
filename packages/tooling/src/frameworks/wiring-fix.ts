// SPDX-License-Identifier: BUSL-1.1
// Licensed under the Business Source License 1.1 (see LICENSE); Change Date: four years from publication; Change License: Apache-2.0
// Copyright (c) 2026 Empower Agile
import type { Wiring } from "./framework-row.js";
import { wiringSnippet } from "./wiring-snippets.js";

/** Wiring a project writes into its own source — the only kind a fix can quote. */
export type SnippetWiring = Extract<Wiring, { kind: "snippet" }>;

/**
 * The wiring half of a fix: what to add, where its lines come from, and the lines themselves —
 * the compiled fixture's text, verbatim, as the last thing in the fix.
 */
export function wiringFix(wiring: SnippetWiring): string {
  return `add ${wiring.description}, adapted to this project (the lines below are ${wiring.fixture}, a compiled and tested file):\n${wiringSnippet(wiring.fixture)}`;
}
