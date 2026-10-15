// SPDX-License-Identifier: BUSL-1.1
// Licensed under the Business Source License 1.1 (see LICENSE); Change Date: four years from publication; Change License: Apache-2.0
// Copyright (c) 2026 Empower Agile
/**
 * One row of the platform table: marker → pointer → install path for a stranger → evidence lane.
 *
 * INTENT: a new platform is a new row, never new machinery. `init`'s plan, `uninstall`, the doctor's
 * `config.skills-installed`, the Cursor plugin manifest and `documentation/use-with-your-agent.md`
 * all read these rows. Row ids and lane ids are a cross-port contract — append, never rename.
 */

/**
 * What `init` writes so a platform's agent finds the skills before it happens to look.
 *
 * `none`: the platform reads `.agents/skills` and `AGENTS.md` on its own. `managed-section`: the
 * section `AGENTS.md` carries, in the platform's own always-on memory file (Replit's `replit.md`).
 * `rule`: one rule file of the platform's own format carrying `text` inside a managed section.
 * Never a copy of the skill pages (no third page flavour) and never a symbolic link.
 */
export type Pointer =
  | { readonly kind: "none"; readonly path: "" }
  | { readonly kind: "managed-section"; readonly path: string }
  | { readonly kind: "rule"; readonly path: string; readonly text: string };

/** The {@link PlatformRow.evidenceLane} of a platform no automated trial exercises. */
export const MANUAL_LANE = "manual";

export interface PlatformRow {
  readonly id: string;
  /** The platform as a reader names it. */
  readonly name: string;
  /**
   * Project-relative paths whose existence proves the platform is in use; any one is enough. Matched
   * as exact paths, so a near miss such as `.cursorx/` proves nothing.
   */
  readonly markerPaths: readonly string[];
  readonly pointer: Pointer;
  /** How a stranger gets the skills on this platform, as the docs page prints it. */
  readonly installPath: string;
  /** What the platform's agent will find in a project that ran `init`. */
  readonly agentFinds: string;
  /** The Tier B lane id that exercises the platform, or {@link MANUAL_LANE}. */
  readonly evidenceLane: string;
  /** `yyyy-mm-dd`: when this row's facts were last checked against the vendor's own documentation. */
  readonly verified: string;
}

const KEBAB = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const DATE = /^\d{4}-\d{2}-\d{2}$/;

/** A date that exists on the calendar: `2026-13-45` has the shape and is no day. */
function isCalendarDate(text: string): boolean {
  const parsed = new Date(`${text}T00:00:00Z`);
  return !Number.isNaN(parsed.getTime()) && parsed.toISOString().startsWith(text);
}

function requireText(row: PlatformRow, value: string, column: string): void {
  if (value.trim() === "") throw new Error(`row ${row.id} leaves its ${column} empty`);
}

function requireProjectRelative(row: PlatformRow, path: string, what: string): void {
  const escapes = path.split("/").includes("..");
  if (path.trim() === "" || path.startsWith("/") || escapes) {
    throw new Error(`row ${row.id}: ${what} is project-relative and stays inside it`);
  }
}

function requireValidPointer(row: PlatformRow): void {
  const { pointer } = row;
  if (pointer.kind === "none") {
    if (pointer.path !== "") throw new Error(`row ${row.id}: a none pointer points at no file`);
    return;
  }
  requireProjectRelative(row, pointer.path, "a pointer path");
  if (pointer.kind === "rule") requireText(row, pointer.text, "rule text");
}

/**
 * A validated row.
 *
 * @throws {Error} naming the row when an id is not kebab-case, a column is empty, no marker path is
 * given, the lane is neither a kebab-case id nor `manual`, the date is not `yyyy-mm-dd`, or the
 * pointer contradicts itself or leaves the project.
 */
export function platformRow(row: PlatformRow): PlatformRow {
  if (!KEBAB.test(row.id)) throw new Error(`a row id is kebab-case, got "${row.id}"`);
  requireText(row, row.name, "name");
  if (row.markerPaths.length === 0) throw new Error(`row ${row.id} has no marker path`);
  for (const marker of row.markerPaths) requireProjectRelative(row, marker, "a marker path");
  requireText(row, row.installPath, "install path");
  requireText(row, row.agentFinds, "agent-finds text");
  if (!KEBAB.test(row.evidenceLane)) throw new Error(`row ${row.id} names a lane id or manual`);
  if (!DATE.test(row.verified) || !isCalendarDate(row.verified)) {
    throw new Error(`row ${row.id} carries a yyyy-mm-dd date`);
  }
  requireValidPointer(row);
  return Object.freeze({ ...row, markerPaths: Object.freeze([...row.markerPaths]) });
}
