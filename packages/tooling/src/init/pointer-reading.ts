// SPDX-License-Identifier: BUSL-1.1
// Licensed under the Business Source License 1.1 (see LICENSE); Change Date: four years from publication; Change License: Apache-2.0
// Copyright (c) 2026 Empower Agile
import type { PlatformRow } from "../platforms/platform-row.js";
import { PLATFORM_ROWS } from "../platforms/platform-table.js";
import { hasExactlyOneRegion, scanMarkedBlocks } from "./marked-block.js";
import type { ProjectState } from "./project-state.js";

/**
 * What one detected platform's pointer file looks like in a project — the installer's own reading,
 * handed to the doctor so both agree on what "present" means.
 *
 * INTENT: the doctor must not scan marker text itself (`marked-block.ts` is the one place that decides
 * what counts as a marker), so the installer's package turns a {@link ProjectState} into these facts
 * and the doctor only judges them.
 *
 * @llmNote `coordinate` is `""` unless `status` is `section`, and also when the section carries no
 * stamp — the plugin's own unstamped rule, which `init` adopts.
 */

/** What is at a pointer's path. */
export type PointerStatus =
  /** Nothing is there. */
  | "absent"
  /** The path, or a directory above it, is a symbolic link; nothing is read or written. */
  | "linked"
  /** A file is there, but it does not carry exactly one NarrativeTrace section. */
  | "foreign"
  /** A file with exactly one NarrativeTrace section, stamped or not. */
  | "section";

export interface PointerReading {
  readonly platformId: string;
  readonly platformName: string;
  /** The pointer file, project-relative. */
  readonly path: string;
  readonly status: PointerStatus;
  /** The carrier coordinate on the section's opening marker. */
  readonly coordinate: string;
}

function readingOf(row: PlatformRow, path: string, state: ProjectState): PointerReading {
  const base = { platformId: row.id, platformName: row.name, path };
  if (state.pointersBehindLinks.has(path)) return { ...base, status: "linked", coordinate: "" };
  if (state.pointersUnwritable.has(path)) return { ...base, status: "foreign", coordinate: "" };
  const text = state.pointerFiles.get(path);
  if (text === undefined) return { ...base, status: "absent", coordinate: "" };
  const scan = scanMarkedBlocks(text);
  const region = scan.regions[0];
  if (!hasExactlyOneRegion(scan) || region === undefined) {
    return { ...base, status: "foreign", coordinate: "" };
  }
  return { ...base, status: "section", coordinate: region.coordinate };
}

/**
 * One reading per DETECTED platform whose row has a pointer, in platform-table order. A platform the
 * project is not on has nothing to be missing, and a row with no pointer has nothing to read.
 *
 * @throws {TypeError} when there is no snapshot.
 */
export function readPointers(state: ProjectState): PointerReading[] {
  if (state == null) throw new TypeError("reading pointers needs a project state");
  return PLATFORM_ROWS.filter((row) => row.pointer.kind !== "none")
    .filter((row) => state.detectedPlatforms.has(row.id))
    .map((row) => readingOf(row, row.pointer.path, state));
}
