// SPDX-License-Identifier: BUSL-1.1
// Licensed under the Business Source License 1.1 (see LICENSE); Change Date: four years from publication; Change License: Apache-2.0
// Copyright (c) 2026 Empower Agile
import type { TraceTree } from "@narrativetrace/core";
import { MERMAID_GRAMMAR } from "./mermaid-grammar.js";
import { collectParticipants, declareParticipants, renderInteractions } from "./sequence-walk.js";

/**
 * Renders `tree` as a Mermaid `sequenceDiagram`, one participant per class, short-aliased.
 *
 * @remarks Drives the shared `sequence-walk.ts` traversal with {@link MERMAID_GRAMMAR}'s arrow and
 * note literals — see `sequence-walk.ts`'s own module doc for the traversal's invariants.
 */
export function renderMermaidSequence(tree: TraceTree): string {
  const aliases = collectParticipants(tree.roots);

  return [
    MERMAID_GRAMMAR.header,
    ...declareParticipants(aliases),
    ...renderInteractions(tree.roots, aliases, MERMAID_GRAMMAR),
  ].join("\n");
}
