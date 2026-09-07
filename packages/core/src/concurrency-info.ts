// SPDX-License-Identifier: BUSL-1.1
// Licensed under the Business Source License 1.1 (see LICENSE); Change Date: four years from publication; Change License: Apache-2.0
// Copyright (c) 2026 Empower Agile
/**
 * How a concurrent task relates to its spawner: `fork-join` (the parent awaits the task),
 * `fire-and-forget` (the parent does not), or `async` (work propagated across an asynchronous
 * boundary by a context snapshot and adopted back). Drives how renderers attribute the task's
 * timing.
 *
 * @remarks `async` exists so a concurrent scenario can hold a stable baseline: it marks the *first*
 * span opened under an activated snapshot — everything deeper is ordinary sequential work in that
 * scope — and the group it names is keyed by the launching span, so every async child of one call
 * renders as one group whose member order the scheduler, not the code, decided.
 */
export type ConcurrencyKind = "fork-join" | "fire-and-forget" | "async";

/**
 * Marks a {@link TraceNode} as a member of a concurrent group.
 *
 * INTENT: lets renderers cluster and label sibling calls that ran in parallel. `groupId` ties
 * members of one fork together; `taskLabel` is the human-readable name for this branch.
 */
export type ConcurrencyInfo = {
  readonly groupId: string;
  readonly taskLabel: string;
  readonly kind: ConcurrencyKind;
};

/**
 * Builds a frozen {@link ConcurrencyInfo} tag for a node.
 *
 * @param groupId shared identifier linking all members of one fork/join group.
 * @param taskLabel human-readable label for this branch, shown in rendered output.
 * @param kind fork-join vs fire-and-forget relationship to the spawning call.
 */
export function concurrencyInfo(
  groupId: string,
  taskLabel: string,
  kind: ConcurrencyKind,
): ConcurrencyInfo {
  return Object.freeze({ groupId, taskLabel, kind });
}
