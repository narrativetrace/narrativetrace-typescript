// SPDX-License-Identifier: BUSL-1.1
// Licensed under the Business Source License 1.1 (see LICENSE); Change Date: four years from publication; Change License: Apache-2.0
// Copyright (c) 2026 Empower Agile
import { parseTracingLevel, type TracingLevel } from "@narrativetrace/core";
import { ENV_KEYS, type EnvConfig } from "./env-config.js";
import { type ConfigFileReader, readFileConfig, readProjectFile } from "./file-config.js";

/** Inputs of {@link resolveConfig}; every one is injectable so resolution is testable. */
export interface ResolveConfigOptions {
  /** Environment channel. @defaultValue `process.env` */
  readonly env?: Record<string, string | undefined>;
  /** Directory searched for a config source. @defaultValue `process.cwd()` */
  readonly projectRoot?: string;
  /** Filesystem seam. @defaultValue a `readFileSync` adapter treating ENOENT as absent */
  readonly read?: ConfigFileReader;
  /** Level used when neither channel supplies a usable one. @defaultValue `"detail"` */
  readonly fallbackLevel?: TracingLevel;
}

/** String settings carried by both channels, in the shape {@link EnvConfig} exposes them. */
const STRING_KEYS = ["output", "outputDir", "format"] as const;

function stringSetting(source: Record<string, unknown>, key: string): string | undefined {
  const value = source[key];
  return typeof value === "string" && value !== "" ? value : undefined;
}

/**
 * Resolves effective settings from both channels, highest precedence first:
 * environment variable → config file → `fallbackLevel`.
 *
 * INTENT: the single entry point production code and test fixtures should use. It is the
 * platform equivalent of Java's `ConfigResolver` (system property → `narrativetrace.properties`),
 * with env vars standing in for system properties and a project-root JSON file for the classpath
 * resource. Unknown keys and wrongly-typed values in the file are ignored, but an unreadable or
 * duplicated file is a hard error — see {@link readFileConfig}.
 *
 * @param options injectable channels; see {@link ResolveConfigOptions}.
 * @returns the merged settings, always carrying a `level`.
 * @throws {DuplicateConfigurationError} when the project root declares more than one source.
 * @throws {Error} when the single config source is not valid JSON or is not a JSON object.
 */
export function resolveConfig(options: ResolveConfigOptions = {}): EnvConfig {
  const env = options.env ?? process.env;
  const fallback = options.fallbackLevel ?? "detail";
  const file =
    readFileConfig(options.projectRoot ?? process.cwd(), options.read ?? readProjectFile) ?? {};

  // Chain, not a coalesce: a garbage env level degrades to the file's level, and a garbage file
  // level degrades to `fallback` — each channel keeps the lenient contract it has on its own.
  const level = parseTracingLevel(
    env[ENV_KEYS.level],
    parseTracingLevel(stringSetting(file, "level"), fallback),
  );

  const merged: Record<string, string> = {};
  for (const key of STRING_KEYS) {
    const value = env[ENV_KEYS[key]] || stringSetting(file, key);
    if (value) merged[key] = value;
  }
  return { level, ...merged };
}
