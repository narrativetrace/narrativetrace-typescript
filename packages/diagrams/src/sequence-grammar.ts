// SPDX-License-Identifier: BUSL-1.1
// Licensed under the Business Source License 1.1 (see LICENSE); Change Date: four years from publication; Change License: Apache-2.0
// Copyright (c) 2026 Empower Agile
import type { TreeWalkStop } from "@narrativetrace/core";
import type { DiagramLabel } from "./diagram-label.js";

/**
 * The per-format literals `sequence-walk.ts`'s shared traversal needs to render one trace tree as
 * a sequence diagram — everything Mermaid and PlantUML disagree about, in one place. Port of the
 * Java reference's `SequenceGrammar` interface.
 *
 * INTENT: `mermaid-sequence.ts` and `plantuml-sequence.ts` used to each own a private copy of the
 * traversal, differing only in header/footer text, arrow syntax, and return/throw/limited-node
 * notation. Extracted by composition, not inheritance: `sequence-walk.ts` owns the walk and the
 * caller-chain bookkeeping — written once — a `SequenceGrammar` owns everything the two formats
 * disagree about.
 *
 * @remarks Every hook that carries trace-derived text takes a {@link DiagramLabel}, never a raw
 * `string` — see that type's own module doc; `shape-checks/sequence-grammar-shape.ts` is the
 * compile-time proof no hook regresses to a `string` parameter (this port's mirror of the Java
 * reference's reflection-based `SequenceGrammarShapeTest`, since TS has no runtime reflection over
 * a structural interface's declared parameter types). {@link activate}/{@link deactivate} have no
 * Java analog: PlantUML's TS port renders activation bars Java's PlantUML renderer does not, so
 * these two hooks are optional and Mermaid's grammar simply omits them.
 */
export interface SequenceGrammar {
  /** The diagram's opening line. */
  readonly header: string;
  /** The diagram's closing line, or `""` when the format has none (Mermaid). */
  readonly footer: string;
  /** One call arrow, caller to target, naming the call signature. */
  callArrow(caller: DiagramLabel, target: DiagramLabel, signature: DiagramLabel): string;
  /** One return arrow, target back to caller, carrying the return message. */
  returnArrow(target: DiagramLabel, caller: DiagramLabel, message: DiagramLabel): string;
  /** One throw arrow, target back to caller, naming the exception type. */
  throwArrow(target: DiagramLabel, caller: DiagramLabel, exceptionType: DiagramLabel): string;
  /** The note for a node whose outcome never arrived (an in-flight call). */
  incomplete(target: DiagramLabel): string;
  /** The note appended after a node the walk stopped at instead of descending into. */
  limitedNote(target: DiagramLabel, stop: TreeWalkStop): string;
  /** Emitted right after the call arrow, before descending. PlantUML only. */
  activate?(target: DiagramLabel): string;
  /** Emitted right after the outcome, on every exit (including a stopped node). PlantUML only. */
  deactivate?(target: DiagramLabel): string;
}
