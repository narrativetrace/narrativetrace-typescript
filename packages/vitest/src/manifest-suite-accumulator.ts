// SPDX-License-Identifier: BUSL-1.1
// Licensed under the Business Source License 1.1 (see LICENSE); Change Date: four years from publication; Change License: Apache-2.0
// Copyright (c) 2026 Empower Agile
import {
  type RunIdentity,
  renderScenarioManifest,
  SCENARIO_MANIFEST_FILE_NAME,
  type ScenarioManifestEntry,
} from "@narrativetrace/core-node";
import { createPerProcessRegistry } from "./per-process-registry.js";
import { type ArtifactSink, whenNonEmpty } from "./suite-artifact-io.js";

/**
 * Per-process registry that the fixture pushes into as each test writes its artifacts, drained by
 * the suite reporter once every test in the process has run — the manifest twin of
 * `suite-clarity-accumulator.ts`/`structural-suite-accumulator.ts` — see
 * `per-process-registry.ts`.
 *
 * @remarks Wiring `manifest.json` into this package was a disclosed gap (the port shipped
 * `renderScenarioManifest` in `core` with no writer here) until the 2026-09-13 run-name ruling
 * asked for a `run` field on it — closed as part of that work, not a separate effort.
 */
const registry = createPerProcessRegistry<ScenarioManifestEntry>();

export function recordManifestEntry(entry: ScenarioManifestEntry): void {
  registry.record(entry);
}

export function manifestEntryCount(): number {
  return registry.count();
}

/** Returns a copy of the accumulated entries (insertion order) and clears the registry. */
export function drainManifestEntries(): ScenarioManifestEntry[] {
  return registry.drain();
}

/** Injected IO so manifest writing is testable without the real filesystem. */
export type ManifestArtifactSink = ArtifactSink;

export interface ManifestWriteOutcome {
  written: boolean;
  path?: string;
}

/**
 * Writes ONE `manifest.json` for the whole suite — one row per traced scenario, plus the run's own
 * `id`/`name` when `run` is given (2026-09-13 ruling, item 2). An empty suite writes nothing, same
 * contract every other suite artifact in this package keeps.
 */
export function writeSuiteManifest(
  entries: readonly ScenarioManifestEntry[],
  outputDir: string,
  sink: ManifestArtifactSink,
  run?: RunIdentity,
): ManifestWriteOutcome {
  return whenNonEmpty(entries, () => {
    sink.mkdir(outputDir);
    const path = `${outputDir}/${SCENARIO_MANIFEST_FILE_NAME}`;
    sink.writeFile(path, renderScenarioManifest(entries, run));
    return { written: true, path };
  });
}
