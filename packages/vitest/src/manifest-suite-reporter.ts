// SPDX-License-Identifier: BUSL-1.1
// Licensed under the Business Source License 1.1 (see LICENSE); Change Date: four years from publication; Change License: Apache-2.0
// Copyright (c) 2026 Empower Agile
import { resolveEnvConfig, type ScenarioManifestEntry } from "@narrativetrace/core-node";
import { type ManifestArtifactSink, writeSuiteManifest } from "./manifest-suite-accumulator.js";
import { runIdentity } from "./run-identity-accumulator.js";
import { nodeFsArtifactSink } from "./suite-artifact-io.js";
import { collectTaskMeta, type WalkableTask } from "./task-meta-walk.js";

// The fixture stamps the manifest row onto Vitest's per-task `meta`, which is serialized from
// workers to the main-process reporter — the cross-worker-safe accumulation channel (same pattern
// as `narrativeClarity` in clarity-suite-reporter.ts and `narrativeStructuralDelta` in
// structural-suite-reporter.ts).
declare module "vitest" {
  interface TaskMeta {
    narrativeManifestEntry?: ScenarioManifestEntry;
  }
}

interface TaskMetaShape {
  narrativeManifestEntry?: ScenarioManifestEntry;
}

type TaskLike = WalkableTask<TaskMetaShape>;

/**
 * Each test's `task.meta.narrativeManifestEntry`, in file-then-test order — see
 * `task-meta-walk.ts` for why this walk, not a module registry, is the cross-worker-safe
 * accumulation path.
 */
export function collectManifestEntries(files: readonly TaskLike[]): ScenarioManifestEntry[] {
  return collectTaskMeta(files, (meta) => meta?.narrativeManifestEntry);
}

export interface ManifestSuiteReporterOptions {
  outputDir?: string;
  sink?: ManifestArtifactSink;
}

/**
 * Vitest reporter that, once every test file has run, writes ONE `manifest.json` for the whole
 * suite — one row per traced scenario, naming the run (2026-09-13 ruling, item 2). Closes a
 * pre-existing gap: this port shipped `renderScenarioManifest` in `core` with no writer here until
 * this reporter. An empty suite (no manifest metadata) writes nothing.
 */
export class ManifestSuiteReporter {
  private readonly outputDir: string;
  private readonly sink: ManifestArtifactSink;

  constructor(options: ManifestSuiteReporterOptions = {}) {
    this.outputDir = options.outputDir ?? resolveEnvConfig().outputDir ?? "narrativetrace-output";
    this.sink = options.sink ?? nodeFsArtifactSink();
  }

  /** Establishes this process's run identity early — see `ClaritySuiteReporter.onInit`. */
  onInit(): void {
    runIdentity();
  }

  onFinished(files: readonly TaskLike[] = []): void {
    const entries = collectManifestEntries(files);
    writeSuiteManifest(entries, this.outputDir, this.sink, runIdentity());
  }
}
