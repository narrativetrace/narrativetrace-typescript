// SPDX-License-Identifier: BUSL-1.1
// Licensed under the Business Source License 1.1 (see LICENSE); Change Date: four years from publication; Change License: Apache-2.0
// Copyright (c) 2026 Empower Agile
import { readFileSync } from "node:fs";

/**
 * Reads a file by absolute path, returning `undefined` when it does not exist.
 *
 * INTENT: the single filesystem seam of the file-config channel, so resolution is testable
 * without touching a real project tree. Existence and read are one call deliberately — a
 * separate `exists` check would be a TOCTOU race.
 */
export type ConfigFileReader = (path: string) => string | undefined;

/**
 * Default {@link ConfigFileReader}: reads UTF-8 text, mapping "not there" to `undefined`.
 *
 * @remarks Only a missing path is absent — a permissions or I/O failure propagates, because
 * silently treating an unreadable config as "no config" is how misconfiguration hides.
 */
export function readProjectFile(path: string): string | undefined {
  try {
    return readFileSync(path, "utf-8");
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return undefined;
    throw error;
  }
}

/** Config sources recognized in the project root, in the order they are reported. */
const SOURCES = ["narrativetrace.config.json", ".narrativetracerc.json"] as const;

/**
 * Thrown when a project root declares more than one config source.
 *
 * INTENT: two configurations must never resolve by silent precedence — the reader cannot know
 * which one the author meant, and picking either hides the mistake until it surprises someone in
 * production. Port of Java `DuplicateConfigurationException` (ConfigResolver's classpath rule).
 */
export class DuplicateConfigurationError extends Error {
  constructor(readonly sources: readonly string[]) {
    super(
      `Multiple NarrativeTrace configuration sources found: ${sources.join(", ")}. ` +
        "Keep exactly one and delete the rest.",
    );
    this.name = "DuplicateConfigurationError";
  }
}

type PresentSource = { readonly source: string; readonly text: string };

/** Every recognized source that actually exists in `projectRoot`, in {@link SOURCES} order. */
function presentSources(projectRoot: string, read: ConfigFileReader): PresentSource[] {
  const present: PresentSource[] = [];
  for (const source of SOURCES) {
    const text = read(`${projectRoot}/${source}`);
    if (text !== undefined) present.push({ source, text });
  }
  return present;
}

/**
 * Parses one config source, failing fast with the offending file named. A file that exists but
 * cannot be understood is an authoring mistake: degrading to defaults would hide it behind
 * behavior that looks deliberate.
 */
function parseConfig(source: string, text: string): Record<string, unknown> {
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch (cause) {
    throw new Error(`${source} is not valid JSON: ${(cause as Error).message}`, { cause });
  }
  if (parsed === null || typeof parsed !== "object" || Array.isArray(parsed)) {
    throw new TypeError(`${source} must be a JSON object, got ${describe(parsed)}`);
  }
  return parsed as Record<string, unknown>;
}

function describe(value: unknown): string {
  if (value === null) return "null";
  return Array.isArray(value) ? "an array" : `a ${typeof value}`;
}

/**
 * Resolves the file-config channel from a project root.
 *
 * @param projectRoot absolute path of the directory holding the config source.
 * @param read the filesystem seam; see {@link ConfigFileReader}.
 * @returns `undefined` when the project declares no configuration.
 */
export function readFileConfig(
  projectRoot: string,
  read: ConfigFileReader,
): Record<string, unknown> | undefined {
  const found = presentSources(projectRoot, read);
  if (found.length > 1) throw new DuplicateConfigurationError(found.map((c) => c.source));
  const only = found[0];
  return only === undefined ? undefined : parseConfig(only.source, only.text);
}
