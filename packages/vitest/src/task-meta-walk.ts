// SPDX-License-Identifier: BUSL-1.1
// Licensed under the Business Source License 1.1 (see LICENSE); Change Date: four years from publication; Change License: Apache-2.0
// Copyright (c) 2026 Empower Agile
/**
 * The task-tree shape every `collect*Entries` walker reads — kept structural (no Vitest type
 * import) and generic over `M`, the per-task `meta` shape a given walker cares about.
 */
export interface WalkableTask<M> {
  readonly meta?: M;
  readonly tasks?: readonly WalkableTask<M>[];
}

/**
 * Depth-first walk of Vitest's task tree collecting one value per task, in file-then-test order.
 * Because `task.meta` is serialized from workers to the main-process reporter, this is the
 * cross-worker-safe accumulation path a per-process registry alone cannot give (a registry would
 * only see the one worker it lives in) — shared by every suite reporter in this package
 * (clarity/structural/manifest), which otherwise duplicated the identical walk three times over.
 *
 * @param read extracts this walker's value from one task's `meta`, or `undefined` when that task
 * carries none (a `describe` block, a task the fixture never stamped).
 */
export function collectTaskMeta<M, T>(
  files: readonly WalkableTask<M>[],
  read: (meta: M | undefined) => T | undefined,
): T[] {
  const entries: T[] = [];
  const visit = (task: WalkableTask<M>): void => {
    const value = read(task.meta);
    if (value) entries.push(value);
    for (const child of task.tasks ?? []) visit(child);
  };
  for (const file of files) visit(file);
  return entries;
}
