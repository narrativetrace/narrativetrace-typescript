// SPDX-License-Identifier: BUSL-1.1
// Licensed under the Business Source License 1.1 (see LICENSE); Change Date: four years from publication; Change License: Apache-2.0
// Copyright (c) 2026 Empower Agile
import { CARRIER_COORDINATE_NAME, type Carrier } from "./carrier.js";
import type { ProjectState } from "./project-state.js";

/**
 * The one line an install prints when the pages it is about to write belong to a different release
 * than the project it is writing them into.
 *
 * INTENT: the guard Java did not need. A Gradle plugin resolves the skills artifact at the same
 * version as everything else in the build; `npx @narrativetrace/cli` resolves whatever npm hands over,
 * which is the latest release unless the project keeps the CLI as a dev dependency. So a consumer on
 * an older release can install newer pages without noticing.
 *
 * @llmNote A warning, never a refusal (D4 as ruled). Refusing would block the empty-project path the
 * published prompt sends every reader down — there is no project version to match there at all — and
 * the doctor's own staleness finding catches the result either way. With no resolvable project version
 * this says nothing: silence is the honest answer to a question the project cannot answer.
 *
 * @sideEffects None. A pure function of the carrier and the snapshot.
 */

/** The version half of a `name@version` coordinate; `""` when it carries none. */
export function versionOf(coordinate: string): string {
  const at = coordinate.lastIndexOf("@");
  return at <= 0 ? "" : coordinate.slice(at + 1);
}

/**
 * The warning line, or `undefined` when there is nothing to warn about — the versions agree, or the
 * project resolves no NarrativeTrace release at all.
 *
 * @throws {TypeError} when the carrier or the snapshot is missing.
 */
export function carrierVersionWarning(carrier: Carrier, state: ProjectState): string | undefined {
  if (carrier == null || state == null) {
    throw new TypeError("the version guard needs a carrier and a project state");
  }
  const projectVersion = state.projectVersion;
  const carrierVersion = versionOf(carrier.coordinate);
  if (projectVersion === undefined || projectVersion === carrierVersion) return undefined;
  return (
    `note: these pages come from ${CARRIER_COORDINATE_NAME}@${carrierVersion}, but this project` +
    ` resolves NarrativeTrace ${projectVersion} — run` +
    ` \`npx --yes @narrativetrace/cli@${projectVersion} init\` to install the pages that match it.`
  );
}
