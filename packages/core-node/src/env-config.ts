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
  /** Turns on approval mode: a passing test's structure is verified against its approved trace. */
  approval: "NARRATIVETRACE_APPROVAL",
  /** Directory approved/received traces live under. */
  approvedDir: "NARRATIVETRACE_APPROVED_DIR",
  /** Opts into the flat, value-free `.structural.json` sibling artifact. */
  structuralJson: "NARRATIVETRACE_STRUCTURAL_JSON",
} as const;

export interface EnvConfig {
  readonly level: TracingLevel;
  readonly output?: string;
  readonly outputDir?: string;
  readonly format?: string;
  readonly approval?: string;
  readonly approvedDir?: string;
  readonly structuralJson?: string;
}

type EnvSource = Record<string, string | undefined>;

/** String settings this resolver carries straight through when present and non-empty. */
const STRING_KEYS = [
  "output",
  "outputDir",
  "format",
  "approval",
  "approvedDir",
  "structuralJson",
] as const;

/**
 * The single seam through which Node reads NARRATIVETRACE_* configuration. Browser builds never
 * import this module (no process.env), so it compiles out of browser bundles. A garbage/blank
 * level degrades to `fallbackLevel` via the lenient parser rather than throwing.
 */
export function resolveEnvConfig(
  env: EnvSource = process.env,
  fallbackLevel: TracingLevel = "detail",
): EnvConfig {
  const strings: Record<string, string> = {};
  for (const key of STRING_KEYS) {
    const value = env[ENV_KEYS[key]];
    if (value) strings[key] = value;
  }
  return { level: parseTracingLevel(env[ENV_KEYS.level], fallbackLevel), ...strings };
}
