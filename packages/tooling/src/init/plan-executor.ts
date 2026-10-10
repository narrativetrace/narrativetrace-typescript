// SPDX-License-Identifier: BUSL-1.1
// Licensed under the Business Source License 1.1 (see LICENSE); Change Date: four years from publication; Change License: Apache-2.0
// Copyright (c) 2026 Empower Agile
import { randomBytes } from "node:crypto";
import { existsSync, mkdirSync, renameSync, rmdirSync, unlinkSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import type { Action } from "./action.js";
import {
  type AppliedAction,
  appliedAction,
  type ExecutionReport,
  executionReport,
} from "./execution-report.js";
import { isDirectory, symlinkTargetOf } from "./files.js";
import type { InitPlan } from "./init-plan.js";

/**
 * Applies a plan to a project directory. The only module in the installer that writes.
 *
 * INTENT: keeps the decisions and the writing apart. The executor asks the project NOTHING — a plan
 * carries every file's whole text — so what a person reviewed as a diff is exactly what lands, and the
 * planners stay testable without a filesystem.
 *
 * @llmNote Every write is temp-file-then-rename inside the TARGET directory, so a failed write leaves
 * the original file exactly as it was. The temp file goes beside the target on purpose: a rename across
 * filesystems, which a temp directory elsewhere would force, is a copy, and a copy is not atomic.
 *
 * @llmNote Nothing here throws on a file that will not cooperate: the action is reported as refused, the
 * rest of the plan runs, and the exit code carries the news. A dry-run plan is the one exception —
 * applying one is a programming error, not a filesystem one.
 *
 * @sideEffects Creates, replaces and deletes files under the given directory, and creates the
 * directories above them.
 */

const TEMPORARY_PREFIX = ".narrativetrace-";

/** The project-relative path of an action, resolved against the project root. */
function targetOf(projectDirectory: string, action: Action): string {
  return join(projectDirectory, ...action.path.split("/"));
}

/** Temp file beside the target, then a rename over it. */
function write(target: string, content: string): void {
  const directory = dirname(target);
  mkdirSync(directory, { recursive: true });
  const temporary = join(directory, `${TEMPORARY_PREFIX}${randomBytes(8).toString("hex")}.tmp`);
  try {
    writeFileSync(temporary, content, "utf8");
    renameSync(temporary, target);
  } finally {
    if (existsSync(temporary)) unlinkSync(temporary);
  }
}

/** Removes a directory that is now empty; one that is not is reported, never emptied. */
function removeDirectory(action: Action, target: string): AppliedAction {
  try {
    if (existsSync(target)) rmdirSync(target);
    return appliedAction(action, "applied");
  } catch (cause) {
    if ((cause as { code?: string }).code !== "ENOTEMPTY") throw cause;
    return appliedAction(
      action,
      "refused",
      `${target} is not empty — something else is in it, so it was left alone`,
    );
  }
}

function applyEdit(action: Action, target: string): AppliedAction {
  if (action.kind === "delete") {
    if (existsSync(target)) unlinkSync(target);
  } else {
    write(target, action.after);
  }
  return appliedAction(action, "applied");
}

/**
 * No write and no delete ever passes THROUGH a symbolic link. The planners refuse every link they can
 * see; this is the guarantee for one they cannot — a link made between the read and the write, or one
 * further up the path than a planner looks. The action is refused like any other filesystem refusal,
 * and the rest of the plan still runs.
 *
 * @throws {Error} naming the element that is a link, which {@link apply} turns into the refusal.
 */
function requireNoLinkOnTheWay(projectDirectory: string, relative: string): void {
  let walked = projectDirectory;
  for (const element of relative.split("/")) {
    walked = join(walked, element);
    if (symlinkTargetOf(walked) !== undefined) {
      throw new Error(`${walked} is a symbolic link, and nothing is written through one`);
    }
  }
}

/**
 * The one action that begins by deleting: the link goes first — the link ITSELF, never what it points
 * at — so the write that follows creates a real directory or file of the project's own.
 */
function replaceLinkWithPage(action: Action, projectDirectory: string): AppliedAction {
  const link = join(projectDirectory, ...action.link.split("/"));
  if (symlinkTargetOf(link) !== undefined) unlinkSync(link);
  requireNoLinkOnTheWay(projectDirectory, action.path);
  write(targetOf(projectDirectory, action), action.after);
  return appliedAction(action, "applied");
}

/** One action. A filesystem that will not cooperate is a refusal, never a throw. */
function apply(action: Action, projectDirectory: string): AppliedAction {
  const target = targetOf(projectDirectory, action);
  try {
    if (action.kind === "refuse") return appliedAction(action, "refused", action.reason);
    if (action.kind === "replace-link") return replaceLinkWithPage(action, projectDirectory);
    requireNoLinkOnTheWay(projectDirectory, action.path);
    if (action.kind === "delete-directory") return removeDirectory(action, target);
    return applyEdit(action, target);
  } catch (cause) {
    // `String(error)` on a Node filesystem error reads "Error: ENOTEMPTY: directory not empty,
    // rmdir '…'" — the class, the code and the path, which is what a person needs and all Java's own
    // `getSimpleName() + ": " + getMessage()` gives either. Reading `.code`/`.message` off an unknown
    // would add two fallbacks no test could reach.
    return appliedAction(action, "refused", String(cause));
  }
}

/**
 * Applies every action, in order.
 *
 * @throws {TypeError} when the plan is a dry run, or the directory is not one.
 */
export function applyPlan(plan: InitPlan, projectDirectory: string): ExecutionReport {
  if (plan == null || projectDirectory == null) {
    throw new TypeError("applying a plan needs the plan and a project directory");
  }
  if (plan.dryRun) throw new TypeError("a dry run is shown, never applied");
  if (!isDirectory(projectDirectory)) {
    throw new TypeError(`${projectDirectory} is not a directory`);
  }
  return executionReport(
    plan.carrier,
    plan.actions.map((action) => apply(action, projectDirectory)),
  );
}
