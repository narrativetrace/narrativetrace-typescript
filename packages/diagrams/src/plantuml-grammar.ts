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
  callArrow: (caller, target, signature) => `  ${caller} -> ${target} : ${signature}`,
  returnArrow: (target, caller, message) => `  ${target} --> ${caller} : ${message}`,
  throwArrow: (target, caller, exceptionType) =>
    `  ${target} -[#red]-> ${caller} : ${exceptionType}`,
  incomplete: (target) => `  hnote over ${target} : in-flight`,
  limitedNote: (target, stop) => `  hnote over ${target} : ${TREE_WALK_MARKER[stop]}`,
  activate: (target) => `  activate ${target}`,
  deactivate: (target) => `  deactivate ${target}`,
};
