// SPDX-License-Identifier: BUSL-1.1
// Licensed under the Business Source License 1.1 (see LICENSE); Change Date: four years from publication; Change License: Apache-2.0
// Copyright (c) 2026 Empower Agile
import { lstatSync, readFileSync, readlinkSync, realpathSync, statSync } from "node:fs";
import { sep } from "node:path";

/**
 * The filesystem questions the installer's readers ask, answered the same way in both of them.
 *
 * INTENT: "absent", "unreadable" and "not text" lead to opposite decisions — absent means create, and
 * creating over a file we could not read would destroy it. One module decides which is which, so the
 * carrier reader and the project reader cannot drift on it.
 *
 * @llmNote Text is decoded with a FATAL decoder, unlike `readFileSync(path, "utf8")`, which silently
 * substitutes U+FFFD for every undecodable byte. That substitution is the dangerous one here: the
 * planner would compute its edit against the replacement characters and the executor would write them
 * back, so a file that merely could not be decoded would come out of a re-run corrupted.
 *
 * @sideEffects Reads. Never writes.
 */

/**
 * The decoder both readers use.
 *
 * @llmNote `fatal` makes an undecodable byte a failure instead of a U+FFFD substitution.
 * `ignoreBOM: true` is the confusingly named option that KEEPS a leading byte-order mark in the
 * output — the default strips it, which would quietly delete the BOM from a file the installer merely
 * appended a block to, and break the byte-for-byte promise the whole plan rests on.
 */
function decoder(): TextDecoder {
  return new TextDecoder("utf-8", { fatal: true, ignoreBOM: true });
}

/** Whether a directory is there. Anything unstattable — a dangling symlink, a race — is `false`. */
export function isDirectory(path: string): boolean {
  try {
    return statSync(path).isDirectory();
  } catch {
    return false;
  }
}

/**
 * What a symbolic link points at, exactly as the filesystem reports it, or `undefined` when the path
 * is not one.
 *
 * @llmNote This is the ONLY question a skill path may be asked before "is it a directory": `statSync`
 * follows links, so a link to the other flavour's page would otherwise read as a directory of ours and
 * the next write would land at the far end of it. A link that cannot be read at all answers
 * `undefined`, which leads to a refusal rather than to a write — the safe side of the only failure
 * mode left.
 */
export function symlinkTargetOf(path: string): string | undefined {
  try {
    return readlinkSync(path);
  } catch {
    return undefined;
  }
}

/**
 * Whether a REAL directory is at the path — a symbolic link to one is not.
 *
 * @llmNote The no-follow counterpart of {@link isDirectory}, and the one every skill path uses. Node's
 * `statSync` follows the last element of a path, which is exactly the mistake rule 18 exists to
 * forbid.
 */
export function isDirectoryNoFollow(path: string): boolean {
  try {
    return lstatSync(path).isDirectory();
  } catch {
    return false;
  }
}

/**
 * Whether a path REALLY resolves inside a directory — links, chains and all.
 *
 * @llmNote The boundary is a separator, never a bare prefix: a sibling named `…-abcx` shares every
 * character of `…-abc` and is not inside it. A path that resolves to nothing — dangling, or a chain
 * the filesystem will not follow — answers no, the same answer a path outside gets, because the
 * installer treats both as reaching nothing of ours.
 */
export function resolvesInside(directory: string, path: string): boolean {
  try {
    const root = realpathSync(directory);
    const resolved = realpathSync(path);
    return resolved === root || resolved.startsWith(root + sep);
  } catch {
    return false;
  }
}

/** Whether a regular file is there. A directory at that path is not one. */
export function isFile(path: string): boolean {
  try {
    return statSync(path).isFile();
  } catch {
    return false;
  }
}

/**
 * The file's text, or `undefined` when no regular file is there.
 *
 * @llmNote The present-but-unreadable branch is defensive and uncovered on purpose: reaching it needs
 * a path that stats as a regular file and then fails to open — a permission change or a deletion
 * between the two calls — which is not reproducible cross-platform, and is root-immune in a container.
 * The same class as the doctor's environment walk's two catches.
 *
 * @throws {TypeError} when the bytes are not valid UTF-8, naming the file.
 * @throws {Error} when the file exists but cannot be read, naming the file.
 */
export function readTextFile(path: string): string | undefined {
  if (!isFile(path)) return undefined;
  let bytes: Buffer;
  try {
    bytes = readFileSync(path);
  } catch (cause) {
    throw new Error(`cannot read ${path}: ${(cause as Error).message}`);
  }
  try {
    return decoder().decode(bytes);
  } catch {
    throw new TypeError(`${path} is not valid UTF-8, so it cannot be planned against`);
  }
}
