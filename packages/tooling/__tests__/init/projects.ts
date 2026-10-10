// SPDX-License-Identifier: BUSL-1.1
// Licensed under the Business Source License 1.1 (see LICENSE); Change Date: four years from publication; Change License: Apache-2.0
// Copyright (c) 2026 Empower Agile
import { mkdtempSync, readdirSync, readFileSync, rmSync, statSync, symlinkSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, relative } from "node:path";

/**
 * A real temporary project for a property to run in, and the readings a property takes of one.
 *
 * The generative properties need a filesystem — "apply" means nothing without one — and they need a
 * clean one per try, so this owns the create-run-delete shape and the two whole-tree readings both
 * property files compare against: every file with its exact bytes, and every symbolic link left behind.
 *
 * Mirrors `Projects` in the Java reference so the two lists diff.
 *
 * @llmNote The walk never DESCENDS through a link, and the clean-up removes the link itself, so a
 * project holding a link to a directory outside the temp directory never costs that tree a file. A link
 * to a FILE is a different matter: {@link snapshotOf} follows one and reports the TARGET's bytes under
 * the link's own path. That is deliberate — a property asserting that no page was written through a
 * link wants to see what the link resolves to — and it is why {@link linksUnder} exists separately: it
 * is the only reading here that distinguishes a link from a real file.
 */

/** Runs one case in a fresh temp directory, and deletes it whatever happened. */
export function inATemporaryProject(prefix: string, body: (project: string) => void): void {
  const project = mkdtempSync(join(tmpdir(), prefix));
  try {
    body(project);
  } finally {
    rmSync(project, { recursive: true, force: true });
  }
}

/** Whether a real file — or a link to one — is at the path. */
function resolvesToAFile(path: string): boolean {
  try {
    return statSync(path).isFile();
  } catch {
    return false;
  }
}

function walk(project: string, directory: string, files: Map<string, string>): void {
  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    const full = join(directory, entry.name);
    if (entry.isDirectory()) walk(project, full, files);
    else if (resolvesToAFile(full)) files.set(relative(project, full), readFileSync(full, "utf8"));
  }
}

/** Every file under the project, by project-relative path, with its exact bytes. */
export function snapshotOf(project: string): Map<string, string> {
  const files = new Map<string, string>();
  walk(project, project, files);
  return new Map([...files].sort(([one], [other]) => one.localeCompare(other)));
}

function collectLinks(project: string, directory: string, links: string[]): void {
  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    const full = join(directory, entry.name);
    if (entry.isSymbolicLink()) links.push(relative(project, full));
    else if (entry.isDirectory()) collectLinks(project, full, links);
  }
}

/** Every symbolic link left anywhere under the project, by project-relative path. */
export function linksUnder(project: string): string[] {
  const links: string[] = [];
  collectLinks(project, project, links);
  return links.sort();
}

/** A symbolic link at a project path, pointing at an absolute target. */
export function linkAt(at: string, target: string): void {
  symlinkSync(target, at);
}
