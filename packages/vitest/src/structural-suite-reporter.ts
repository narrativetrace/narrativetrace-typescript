// SPDX-License-Identifier: BUSL-1.1
// Licensed under the Business Source License 1.1 (see LICENSE); Change Date: four years from publication; Change License: Apache-2.0
// Copyright (c) 2026 Empower Agile
import type { ScenarioDelta } from "@narrativetrace/core-node";
import { structuralDeltaFooterLine } from "./structural-suite-accumulator.js";
import { collectTaskMeta, type WalkableTask } from "./task-meta-walk.js";

// The fixture stamps the structural delta onto Vitest's per-task `meta`, which is serialized from
// workers to the main-process reporter — the cross-worker-safe accumulation channel (same pattern
// as `narrativeClarity` in clarity-suite-reporter.ts).
declare module "vitest" {
  interface TaskMeta {
    narrativeStructuralDelta?: ScenarioDelta;
  }
}

interface TaskMetaShape {
  narrativeStructuralDelta?: ScenarioDelta;
}

type TaskLike = WalkableTask<TaskMetaShape>;

/**
 * Each test's `task.meta.narrativeStructuralDelta`, in file-then-test order — see
 * `task-meta-walk.ts` for why this walk, not a module registry, is the cross-worker-safe
 * accumulation path.
 */
export function collectStructuralDeltas(files: readonly TaskLike[]): ScenarioDelta[] {
  return collectTaskMeta(files, (meta) => meta?.narrativeStructuralDelta);
}

export interface StructuralSuiteReporterOptions {
  log?: (message: string) => void;
}

/**
 * Vitest reporter that, once every test file has run, prints one "Since last green" line
 * summarizing every scenario's structural status against its last-green artifact. A suite where no
 * test wrote a structural artifact prints nothing.
 */
export class StructuralSuiteReporter {
  private readonly log: (message: string) => void;

  constructor(options: StructuralSuiteReporterOptions = {}) {
    this.log = options.log ?? ((message) => process.stdout.write(`${message}\n`));
  }

  onFinished(files: readonly TaskLike[] = []): void {
    const line = structuralDeltaFooterLine(collectStructuralDeltas(files));
    if (line) this.log(line);
  }
}
