// SPDX-License-Identifier: BUSL-1.1
// Licensed under the Business Source License 1.1 (see LICENSE); Change Date: four years from publication; Change License: Apache-2.0
// Copyright (c) 2026 Empower Agile
import { randomBytes } from "node:crypto";
import { existsSync, renameSync, unlinkSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";

/**
 * Writes a UTF-8 file so a reader sees either the old content or the new, never a torn one.
 *
 * INTENT: the committed glossary pair is curated by hand; a crash or a full disk halfway through a
 * write must not leave a truncated `glossary.json` that the next run refuses to read.
 *
 * @param path destination file; its directory must already exist.
 * @param content full text to store.
 * @throws whatever the filesystem throws (for example `EISDIR` when `path` names a directory); the
 * destination is left untouched and the temporary file is removed.
 * @sideEffects Creates a temporary file beside `path`, then renames it over `path`.
 */
export function atomicWriteFile(path: string, content: string): void {
  const temporary = join(dirname(path), `.narrativetrace-${randomBytes(8).toString("hex")}.tmp`);
  try {
    writeFileSync(temporary, content, "utf-8");
    renameSync(temporary, path);
  } finally {
    if (existsSync(temporary)) unlinkSync(temporary);
  }
}
