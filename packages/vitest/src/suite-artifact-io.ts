// SPDX-License-Identifier: BUSL-1.1
// Licensed under the Business Source License 1.1 (see LICENSE); Change Date: four years from publication; Change License: Apache-2.0
// Copyright (c) 2026 Empower Agile
import { mkdirSync, writeFileSync } from "node:fs";

/** Injected IO so a suite writer is testable without the real filesystem. */
export interface ArtifactSink {
  mkdir: (dir: string) => void;
  writeFile: (path: string, content: string) => void;
}

/**
 * The real filesystem, wired up the way every suite writer in this package (clarity, manifest)
 * wants it by default — `mkdirSync` with `recursive: true` so a nested `outputDir` never fails on
 * a missing parent, `writeFileSync` in UTF-8. Previously copied verbatim into each reporter's
 * constructor.
 */
export function nodeFsArtifactSink(): ArtifactSink {
  return {
    mkdir: (dir) => mkdirSync(dir, { recursive: true }),
    writeFile: (path, content) => writeFileSync(path, content, "utf-8"),
  };
}

/**
 * Runs `body` only when `entries` is non-empty, matching the "no roots, no artifact" contract
 * every per-test emitter in this family already keeps: an empty suite writes nothing at all, no
 * empty files. Previously each suite writer open-coded its own `if (entries.length === 0) return
 * ...` guard ahead of an otherwise-identical `mkdir` + write sequence.
 */
export function whenNonEmpty<T, R extends { written: boolean }>(
  entries: readonly T[],
  body: () => R,
): R | { written: false } {
  if (entries.length === 0) return { written: false };
  return body();
}
