// SPDX-License-Identifier: BUSL-1.1
// Licensed under the Business Source License 1.1 (see LICENSE); Change Date: four years from publication; Change License: Apache-2.0
// Copyright (c) 2026 Empower Agile
import type { ArtifactIdentity } from "./artifact-identity.js";
import type { RunIdentity } from "./run-identity.js";

/** The manifest's name inside the output directory. */
export const SCENARIO_MANIFEST_FILE_NAME = "manifest.json";

const SCHEMA = "narrativetrace/scenario-manifest/1";

/**
 * One traced scenario's row: which test invocation produced it, and every artifact it owns as a
 * path relative to the output directory, in listing order.
 *
 * INTENT: artifact names are derived, not announced, so a reader who knows a scenario had to guess
 * which file holds it — and once a test runs more than once, guessing stops working. `manifest.json`
 * answers the question directly. Port of Java `output.ScenarioManifest.Entry`.
 */
export interface ScenarioManifestEntry {
  /** The humanized scenario name, as the artifacts' own headers spell it. */
  readonly scenario: string;
  readonly identity: ArtifactIdentity;
  /** Role (`trace`, `json`, `diagram`, `structural`, …) → path relative to the output directory. */
  readonly artifacts: ReadonlyMap<string, string>;
}

function renderArtifacts(artifacts: ReadonlyMap<string, string>): string {
  const lines = [...artifacts.entries()].map(
    ([role, path]) => `        ${JSON.stringify(role)}: ${JSON.stringify(path)}`,
  );
  return lines.length === 0 ? "" : `${lines.join(",\n")}\n`;
}

function renderEntry(entry: ScenarioManifestEntry): string {
  const { identity } = entry;
  const invocationLine =
    identity.invocationIndex > 0 ? `      "invocation": ${identity.invocationIndex},\n` : "";
  return (
    "    {\n" +
    `      "scenario": ${JSON.stringify(entry.scenario)},\n` +
    `      "testClass": ${JSON.stringify(identity.moduleName)},\n` +
    `      "testMethod": ${JSON.stringify(identity.testName)},\n` +
    invocationLine +
    `      "artifacts": {\n${renderArtifacts(entry.artifacts)}      }\n` +
    "    }"
  );
}

/**
 * The `"run": {...},\n` object naming the test-suite run that produced the manifest, or empty text
 * when `run` is `undefined` — a caller that has not adopted `RunIdentity` (2026-09-13 ruling, item
 * 2; Java `ScenarioManifest.renderRun`).
 */
function renderRun(run: RunIdentity | undefined): string {
  if (run === undefined) return "";
  return `  "run": {\n    "id": ${JSON.stringify(run.id)},\n    "name": ${JSON.stringify(run.name)}\n  },\n`;
}

/**
 * Renders the `manifest.json` document: one row per traced scenario, in execution order, plus a
 * top-level `run` object (`id`, `name`) naming the enclosing test-suite run when `run` is given
 * (2026-09-13 ruling, item 2). Port of Java `output.ScenarioManifest.render`.
 */
export function renderScenarioManifest(
  entries: readonly ScenarioManifestEntry[],
  run?: RunIdentity,
): string {
  const rows = entries.map(renderEntry).join(",\n");
  return `{\n  "schema": ${JSON.stringify(SCHEMA)},\n${renderRun(run)}  "scenarios": [\n${rows}\n  ]\n}\n`;
}
