// SPDX-License-Identifier: BUSL-1.1
// Licensed under the Business Source License 1.1 (see LICENSE); Change Date: four years from publication; Change License: Apache-2.0
// Copyright (c) 2026 Empower Agile
import type { NarrativeContext } from "./narrative-context.js";

/**
 * A handle that restores a context's prior state when closed.
 *
 * @remarks Always pair `activate` with `close()` (via `try/finally`) so the target context's
 * stack, trace id, and snapshot parent are rolled back even if the wrapped work throws.
 */
export interface ContextScope {
  close(): void;
}

/**
 * A captured point-in-time view of a source context, used to bridge trace state across an
 * asynchronous or cross-thread boundary (fork/background work).
 *
 * INTENT: capture on the originating context, then `activate`/`wrapFn` on the target so forked
 * work is parented to the span that spawned it and shares the same trace id.
 */
export interface ContextSnapshot {
  /**
   * Binds this snapshot onto `context`, returning a {@link ContextScope} the caller must close.
   *
   * @remarks The work traced under the scope **joins the snapshotting context's captured trace**:
   * the target is registered as a live child for the scope's lifetime and hands its whole reportable
   * set over on close. This is what ordinary propagation wants — background work belongs to the
   * trace that launched it.
   */
  activate(context: NarrativeContext): ContextScope;
  /**
   * Binds this snapshot without adoption: work traced under the scope does *not* join the
   * snapshotting context's captured trace, because the caller reports it itself.
   *
   * INTENT: for helpers that own their children's presentation — {@link ForkJoinGroup} publishes
   * its members when it joins, {@link FireAndForgetGroup} when each task settles, both under the
   * launching span. Adopting as well would let a detached child appear in a parent's tree merely
   * because it was still in flight, so the tree would depend on scheduling rather than on the code.
   *
   * @remarks Registers nothing and hands nothing over, at every hop: work the opted-out scope
   * launches further on does not reach the origin either.
   */
  activateWithoutAdoption(context: NarrativeContext): ContextScope;
  /** Runs `fn` with this snapshot active on `context`, restoring prior state in a `finally`. */
  wrapFn<T>(context: NarrativeContext, fn: () => T): T;
}
