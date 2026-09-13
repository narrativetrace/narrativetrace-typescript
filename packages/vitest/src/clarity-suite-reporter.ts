// SPDX-License-Identifier: BUSL-1.1
// Licensed under the Business Source License 1.1 (see LICENSE); Change Date: four years from publication; Change License: Apache-2.0
// Copyright (c) 2026 Empower Agile
import type { ScenarioResult } from "@narrativetrace/clarity";
import { resolveEnvConfig } from "@narrativetrace/core-node";
import { runIdentity } from "./run-identity-accumulator.js";
import { nodeFsArtifactSink } from "./suite-artifact-io.js";
import {
  type SuiteArtifactSink,
  suiteClarityFooter,
  writeSuiteClarityArtifacts,
} from "./suite-clarity-accumulator.js";
import { collectTaskMeta, type WalkableTask } from "./task-meta-walk.js";

// The fixture stamps the clarity scenario onto Vitest's per-task `meta`, which is serialized from
// workers to the main-process reporter — the cross-worker-safe accumulation channel.
declare module "vitest" {
  interface TaskMeta {
    narrativeClarity?: ScenarioResult;
  }
}

interface TaskMetaShape {
  narrativeClarity?: ScenarioResult;
}

type TaskLike = WalkableTask<TaskMetaShape>;

/**
 * Each test's `task.meta.narrativeClarity`, in file-then-test order — see `task-meta-walk.ts` for
 * why this walk, not a module registry, is the cross-worker-safe accumulation path.
 */
export function collectClarityEntries(files: readonly TaskLike[]): ScenarioResult[] {
  return collectTaskMeta(files, (meta) => meta?.narrativeClarity);
}

export interface ClaritySuiteReporterOptions {
  outputDir?: string;
  sink?: SuiteArtifactSink;
  log?: (message: string) => void;
}

/**
 * Vitest reporter that, once every test file has run, writes ONE `clarity-results.json` +
 * `clarity-report.md` for the whole suite and prints the footer once with the high/moderate/low
 * split, naming the run (2026-09-13 ruling, item 2). An empty suite (no clarity metadata) writes
 * nothing and prints no footer.
 */
export class ClaritySuiteReporter {
  private readonly outputDir: string;
  private readonly sink: SuiteArtifactSink;
  private readonly log: (message: string) => void;

  constructor(options: ClaritySuiteReporterOptions = {}) {
    this.outputDir = options.outputDir ?? resolveEnvConfig().outputDir ?? "narrativetrace-output";
    this.sink = options.sink ?? nodeFsArtifactSink();
    this.log = options.log ?? ((message) => process.stdout.write(`${message}\n`));
  }

  /**
   * Establishes this process's run identity as early as Vitest calls a reporter at all — before
   * any worker spawns for the default `pool: "forks"`/`"threads"` timing — so every worker that
   * later asks {@link runIdentity} for its own copy inherits the same one (see
   * `run-identity-accumulator.ts`'s own remarks on the cross-worker handoff).
   */
  onInit(): void {
    runIdentity();
  }

  onFinished(files: readonly TaskLike[] = []): void {
    const entries = collectClarityEntries(files);
    const outcome = writeSuiteClarityArtifacts(entries, this.outputDir, this.sink);
    if (!outcome.written) return;
    const footer = suiteClarityFooter(entries, this.outputDir, runIdentity().name);
    if (footer) this.log(footer);
  }
}
