// SPDX-License-Identifier: BUSL-1.1
// Licensed under the Business Source License 1.1 (see LICENSE); Change Date: four years from publication; Change License: Apache-2.0
// Copyright (c) 2026 Empower Agile
import { generateTraceId, type TraceId } from "./span-id-generator.js";
import { humanName } from "./trace-namer.js";

/**
 * A test-suite execution's own identity: a W3C-shaped id and the three-word phrase derived from it
 * (Java `output.RunIdentity`, 2026-09-13 ruling).
 *
 * INTENT: A trace has a name because a trace id is unreadable; a whole SUITE RUN needs the same
 * thing for a different reason — before this type, nothing named "this execution" at all, so a
 * console footer or a `manifest.json` could say "18 scenarios" but never "which 18-scenario run"
 * when two ran back to back. One `RunIdentity` is generated once per test-suite execution and
 * threaded explicitly to every place that names the run — never re-derived, never a module-wide
 * singleton a caller cannot vary, which is exactly what makes the "two runs, byte-identical
 * artifacts, different run name" proof possible.
 *
 * @remarks Deliberately NOT a `TraceId`: a run is not a trace, has no spans, and must never be
 * confused with one in an exporter or a schema. `generateTraceId` is reused only because a run id
 * needs the same shape (32 lowercase hex) and the same generator's entropy — borrowing the
 * primitive, not the concept. `humanName` is reused outright: the whole point of the ruling is that
 * a run's phrase and a trace's phrase come from the same three tables, so a reader who has learned
 * to read one learns to read both.
 *
 * @remarks Cross-cutting invariant (ruling item 3): a `RunIdentity` must never reach the structural
 * `.nt` text, an approved/received trace, an artifact filename, a manifest per-scenario key, or a
 * `ScenarioDelta` — every function that computes one of those takes no `RunIdentity` parameter at
 * all, so the omission is structural, not a discipline someone has to remember.
 */
export interface RunIdentity {
  /** The run's own W3C-shaped id — 32 lowercase hex characters, unrelated to any trace id. */
  readonly id: string;
  /** The three-word phrase {@link humanName} derives from {@link id}. */
  readonly name: string;
}

/**
 * Generates a fresh run identity: a new random id and the phrase derived from it.
 *
 * @remarks Call this exactly once per test-suite execution — see the type's own remarks — and pass
 * the single result everywhere a run needs to be named. Calling it twice names two different runs,
 * which is correct when there genuinely are two (see the byte-identity proof), and wrong when a
 * caller wanted the same run twice.
 * @throws {Error} if no `IdGenerator` has been registered and this runtime has no Web Crypto — the
 * same contract {@link generateTraceId} has always had.
 */
export function generateRunIdentity(): RunIdentity {
  const id: TraceId = generateTraceId();
  return { id, name: humanName(id) };
}
