// SPDX-License-Identifier: BUSL-1.1
// Licensed under the Business Source License 1.1 (see LICENSE); Change Date: four years from publication; Change License: Apache-2.0
// Copyright (c) 2026 Empower Agile
import { appendToText, eolOf } from "./marked-block.js";

/**
 * One thing an install or an uninstall would do to one path.
 *
 * INTENT: the unit a plan is made of, and the reason a plan can be printed as a diff before anything
 * happens. Every action that touches a file carries the file's WHOLE text before and after, so the
 * executor needs no knowledge of the project at all and the renderer can diff without reading the
 * disk.
 *
 * @llmNote Paths are project-relative, normalized, and always spelled with `/` — an absolute path, or
 * one that climbs out with `..`, is refused at construction. That is the only thing standing between a
 * hand-written plan and a write outside the project. A backslash is left alone: on the platforms this
 * runs on it is a legal character in a NAME, not a separator.
 */

/** A stable token naming the kind, for text and JSON rendering. */
export type ActionKind =
  /** Writes a file that is not there yet. */
  | "create"
  /** Rewrites a file whose NarrativeTrace-owned region changed, or a page it owns whole. */
  | "replace"
  /** Adds the managed block to the end of an existing file, after one blank line. */
  | "append"
  /** Adds one line to the end of an existing file, after one blank line. */
  | "append-line"
  /** Removes a file the installer wrote. */
  | "delete"
  /** Removes a directory the installer created, once its files are gone. */
  | "delete-directory"
  /** Something the installer will NOT do, and why. */
  | "refuse";

/** One planned action. */
export interface Action {
  readonly kind: ActionKind;
  /** The project-relative path this action is about. */
  readonly path: string;
  /** The file's whole text before the action; `""` when it does not exist or this is no file edit. */
  readonly before: string;
  /** The file's whole text after the action; `""` when it is deleted or this is no file edit. */
  readonly after: string;
  /** Why the installer refused; `""` unless {@link kind} is `refuse`. */
  readonly reason: string;
}

/** Whether this action leaves one file with a known text — the ones a diff can be rendered for. */
export function isFileEdit(action: Action): boolean {
  return action.kind !== "refuse" && action.kind !== "delete-directory";
}

/**
 * The same path, normalized.
 *
 * @throws {TypeError} when the path is absent, absolute, empty, or climbs out of the project.
 */
function requireProjectRelative(path: string): string {
  if (typeof path !== "string" || path.trim() === "") {
    throw new TypeError("an action needs a path");
  }
  if (path.startsWith("/") || /^[A-Za-z]:/.test(path)) {
    throw new TypeError(`an action's path must be project-relative, got "${path}"`);
  }
  return normalize(path);
}

function normalize(path: string): string {
  const segments: string[] = [];
  for (const segment of path.split("/")) {
    if (segment === "" || segment === ".") continue;
    if (segment !== "..") segments.push(segment);
    else if (segments.pop() === undefined) {
      throw new TypeError(`an action's path must stay inside the project, got "${path}"`);
    }
  }
  if (segments.length === 0) {
    throw new TypeError(`an action's path must name something, got "${path}"`);
  }
  return segments.join("/");
}

function requireText(text: string, what: string): string {
  if (typeof text !== "string") {
    throw new TypeError(`an action's ${what} is "" when absent, never null`);
  }
  return text;
}

function action(
  kind: ActionKind,
  path: string,
  before: string,
  after: string,
  reason = "",
): Action {
  return Object.freeze({
    kind,
    path: requireProjectRelative(path),
    before: requireText(before, "before text"),
    after: requireText(after, "after text"),
    reason,
  });
}

/** Writes a file that is not there yet. */
export function createFile(path: string, content: string): Action {
  return action("create", path, "", content);
}

/** Rewrites a file, from its whole text to its whole text. */
export function replaceBlock(path: string, before: string, after: string): Action {
  return action("replace", path, before, after);
}

/** Appends the managed block to what is already there, separated by exactly one blank line. */
export function appendBlock(path: string, before: string, block: string): Action {
  return action("append", path, before, appendToText(before, requireText(block, "block")));
}

/** Appends one line to what is already there, with the file's own line ending. */
export function appendLine(path: string, before: string, line: string): Action {
  return action(
    "append-line",
    path,
    before,
    appendToText(before, requireText(line, "line") + eolOf(before)),
  );
}

/** Removes a file the installer wrote. */
export function deleteFile(path: string, before: string): Action {
  return action("delete", path, before, "");
}

/**
 * Removes a directory the installer created, once its files are gone.
 *
 * @llmNote Never recursive: a directory that still holds somebody else's file is left alone and
 * reported, because deleting it would take that file with it.
 */
export function deleteDirectory(path: string): Action {
  return action("delete-directory", path, "", "");
}

/**
 * Something the installer will NOT do, and why.
 *
 * @llmNote A refusal is reported, never thrown: the rest of the plan proceeds, and the run exits 1 so
 * a script notices.
 *
 * @throws {TypeError} when no reason is given — a refusal nobody can act on reaches a person as an
 * empty parenthesis in a warning.
 */
export function refuse(path: string, reason: string): Action {
  if (typeof reason !== "string" || reason.trim() === "") {
    throw new TypeError("a refusal must carry a reason naming what it refused");
  }
  return action("refuse", path, "", "", reason);
}
