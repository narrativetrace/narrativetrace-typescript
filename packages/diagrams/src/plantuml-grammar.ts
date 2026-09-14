// SPDX-License-Identifier: BUSL-1.1
// Licensed under the Business Source License 1.1 (see LICENSE); Change Date: four years from publication; Change License: Apache-2.0
// Copyright (c) 2026 Empower Agile
import { TREE_WALK_MARKER } from "@narrativetrace/core";
import type { SequenceGrammar } from "./sequence-grammar.js";

/**
 * PlantUML grammar: `->` call arrows, `-->` returns, `-[#red]->` throws, `hnote over` for an
 * in-flight outcome or a walk limit, `activate`/`deactivate` bars around every call.
 *
 * @remarks Stateless — one instance serves every render, the same as Mermaid's grammar.
 */
export const PLANTUML_GRAMMAR: SequenceGrammar = {
  header: "@startuml",
  footer: "@enduml",
  // PlantUML's documented syntax is `participant "<label>" as <alias>` — display name first
  // (plantuml.com/sequence-diagram, "Declaring participant": `<participant_type> <label> as
  // <alias>`). 2026-09-13 fix: the shared walk used to emit Mermaid's order for PlantUML too,
  // which real PlantUML renders as a lifeline titled with the short alias, not the class name —
  // confirmed live (see the fix commit's note for the before/after SVG text-node evidence).
  participant: (alias, display) => `  participant ${display} as ${alias}`,
  callArrow: (caller, target, signature) => `  ${caller} -> ${target} : ${signature}`,
  returnArrow: (target, caller, message) => `  ${target} --> ${caller} : ${message}`,
  throwArrow: (target, caller, exceptionType) =>
    `  ${target} -[#red]-> ${caller} : ${exceptionType}`,
  incomplete: (target) => `  hnote over ${target} : in-flight`,
  limitedNote: (target, stop) => `  hnote over ${target} : ${TREE_WALK_MARKER[stop]}`,
  activate: (target) => `  activate ${target}`,
  deactivate: (target) => `  deactivate ${target}`,
};
