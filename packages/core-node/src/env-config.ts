// SPDX-License-Identifier: BUSL-1.1
// Licensed under the Business Source License 1.1 (see LICENSE); Change Date: four years from publication; Change License: Apache-2.0
// Copyright (c) 2026 Empower Agile
import { parseTracingLevel, type TracingLevel } from "@narrativetrace/core";

/** Environment variable names read by the Node resolver. */
export const ENV_KEYS = {
  level: "NARRATIVETRACE_LEVEL",
  output: "NARRATIVETRACE_OUTPUT",
  outputDir: "NARRATIVETRACE_OUTPUT_DIR",
  format: "NARRATIVETRACE_FORMAT",
} as const;

export interface EnvConfig {
  readonly level: TracingLevel;
  readonly output?: string;
  readonly outputDir?: string;
  readonly format?: string;
}

type EnvSource = Record<string, string | undefined>;

/**
 * The single seam through which Node reads NARRATIVETRACE_* configuration. Browser builds never
 * import this module (no process.env), so it compiles out of browser bundles. A garbage/blank
 * level degrades to `fallbackLevel` via the lenient parser rather than throwing.
 */
export function resolveEnvConfig(
  env: EnvSource = process.env,
  fallbackLevel: TracingLevel = "detail",
): EnvConfig {
  const output = env[ENV_KEYS.output];
  const outputDir = env[ENV_KEYS.outputDir];
  const format = env[ENV_KEYS.format];
  return {
    level: parseTracingLevel(env[ENV_KEYS.level], fallbackLevel),
    ...(output ? { output } : {}),
    ...(outputDir ? { outputDir } : {}),
    ...(format ? { format } : {}),
  };
}
