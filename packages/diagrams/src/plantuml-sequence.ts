// SPDX-License-Identifier: BUSL-1.1
// Licensed under the Business Source License 1.1 (see LICENSE); Change Date: four years from publication; Change License: Apache-2.0
// Copyright (c) 2026 Empower Agile
import type { TraceTree } from "@narrativetrace/core";
import { PLANTUML_GRAMMAR } from "./plantuml-grammar.js";
import { collectParticipants, declareParticipants, renderInteractions } from "./sequence-walk.js";

/**
 * Renders `tree` as a PlantUML sequence diagram, one participant per class, short-aliased, with
 * activation bars around every call.
 *
 * @remarks Drives the shared `sequence-walk.ts` traversal with {@link PLANTUML_GRAMMAR}'s arrow
 * and note literals — see `sequence-walk.ts`'s own module doc for the traversal's invariants.
 */
export function renderPlantUmlSequence(tree: TraceTree): string {
  const aliases = collectParticipants(tree.roots);

  return [
    PLANTUML_GRAMMAR.header,
    ...declareParticipants(aliases, PLANTUML_GRAMMAR),
    ...renderInteractions(tree.roots, aliases, PLANTUML_GRAMMAR),
    PLANTUML_GRAMMAR.footer,
  ].join("\n");
}
