// SPDX-License-Identifier: BUSL-1.1
// Licensed under the Business Source License 1.1 (see LICENSE); Change Date: four years from publication; Change License: Apache-2.0
// Copyright (c) 2026 Empower Agile
import { TREE_WALK_MARKER } from "@narrativetrace/core";
import type { SequenceGrammar } from "./sequence-grammar.js";

/**
 * Mermaid `sequenceDiagram` grammar: `->>` call arrows, `-->>` returns, `-x` throws, `Note over`
 * for an in-flight outcome or a walk limit.
 *
 * @remarks Stateless — Mermaid's alias mode is a difference in the label map `mermaid-sequence.ts`
 * passes to `sequence-walk.ts`, not in this grammar, so one instance serves every render.
 */
export const MERMAID_GRAMMAR: SequenceGrammar = {
  header: "sequenceDiagram",
  footer: "",
  // Mermaid's documented syntax is `participant <id> as <label>` — alias first. Unchanged by the
  // 2026-09-13 PlantUML-ordering fix (that grammar's own `participant` hook flips instead).
  participant: (alias, display) => `  participant ${alias} as ${display}`,
  callArrow: (caller, target, signature) => `  ${caller}->>${target}: ${signature}`,
  returnArrow: (target, caller, message) => `  ${target}-->>${caller}: ${message}`,
  throwArrow: (target, caller, exceptionType) => `  ${target}-x${caller}: ${exceptionType}`,
  incomplete: (target) => `  Note over ${target}: in-flight`,
  limitedNote: (target, stop) => `  Note over ${target}: ${TREE_WALK_MARKER[stop]}`,
};
