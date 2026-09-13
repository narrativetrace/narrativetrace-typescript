// SPDX-License-Identifier: BUSL-1.1
// Licensed under the Business Source License 1.1 (see LICENSE); Change Date: four years from publication; Change License: Apache-2.0
// Copyright (c) 2026 Empower Agile
/**
 * Type-level fixture proving `SequenceGrammar`'s hooks cannot be satisfied by a raw `string` —
 * only a `DiagramLabel`, minted by that type's own factories. Compiled with `tsc --noEmit`
 * (tsconfig.shape-check.json, wired into `test`/`coverage`) — never imported at runtime, never
 * executed. This port's mirror of the Java reference's reflection-based `SequenceGrammarShapeTest`:
 * TS has no runtime reflection over a structural interface's declared parameter types, so the
 * check is a compile-time fixture instead — the same "prove it in the type system, not by
 * convention" intent, applied to the interface's declared shape rather than to one implementation.
 */
import type { TreeWalkStop } from "@narrativetrace/core";
import { DiagramLabel } from "../src/diagram-label.js";
import type { SequenceGrammar } from "../src/sequence-grammar.js";

declare const grammar: SequenceGrammar;
const label: DiagramLabel = DiagramLabel.identifier("Svc");
const stop: TreeWalkStop = "cycle";

// Every hook rejects a raw string in place of a DiagramLabel, in every parameter position.
// @ts-expect-error caller must be a DiagramLabel, not a raw string
grammar.callArrow("caller", label, label);
// @ts-expect-error target must be a DiagramLabel, not a raw string
grammar.callArrow(label, "target", label);
// @ts-expect-error signature must be a DiagramLabel, not a raw string
grammar.callArrow(label, label, "signature");
// @ts-expect-error message must be a DiagramLabel, not a raw string
grammar.returnArrow(label, label, "message");
// @ts-expect-error exceptionType must be a DiagramLabel, not a raw string
grammar.throwArrow(label, label, "Error");
// @ts-expect-error incomplete's target must be a DiagramLabel, not a raw string
grammar.incomplete("target");
// @ts-expect-error limitedNote's target must be a DiagramLabel, not a raw string
grammar.limitedNote("target", stop);
// @ts-expect-error activate's target must be a DiagramLabel, not a raw string
grammar.activate?.("target");
// @ts-expect-error deactivate's target must be a DiagramLabel, not a raw string
grammar.deactivate?.("target");

// The valid calls compile clean — proves the fixture is exercising a live interface, not one
// broken in a way that would make every call an error regardless of argument type.
grammar.callArrow(label, label, label);
grammar.returnArrow(label, label, label);
grammar.throwArrow(label, label, label);
grammar.incomplete(label);
grammar.limitedNote(label, stop);
grammar.activate?.(label);
grammar.deactivate?.(label);
