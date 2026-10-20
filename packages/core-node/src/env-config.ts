// SPDX-License-Identifier: BUSL-1.1
// Licensed under the Business Source License 1.1 (see LICENSE); Change Date: four years from publication; Change License: Apache-2.0
// Copyright (c) 2026 Empower Agile
import { parseTracingLevel, type ServiceIdentity, type TracingLevel } from "@narrativetrace/core";

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
  /** Comma-separated field-name patterns appended to the redaction deny-list (never replacing it). */
  redactionAdditionalPatterns: "NARRATIVETRACE_REDACTION_ADDITIONALPATTERNS",
  /**
   * Class-name prefixes (`;` or `,` separated) that are never traced. Key presence decides: any
   * value, even empty, states the whole list and replaces the shipped default.
   */
  exclude: "NARRATIVETRACE_EXCLUDE",
  /** Service name stamped on every span and chapter; unset reads as `unknown_service:node` downstream. */
  serviceName: "NARRATIVETRACE_SERVICE_NAME",
  /** Service version stamped beside the service name. */
  serviceVersion: "NARRATIVETRACE_SERVICE_VERSION",
  /** Deployment environment (`staging`, `production`, …) stamped beside the service name. */
  environment: "NARRATIVETRACE_ENVIRONMENT",
} as const;

export interface EnvConfig {
  readonly level: TracingLevel;
  readonly output?: string;
  readonly outputDir?: string;
  readonly format?: string;
  readonly approval?: string;
  readonly approvedDir?: string;
  readonly structuralJson?: string;
  /** Raw comma-separated value; parsed by `registerAdditionalRedactionPatterns`. */
  readonly redactionAdditionalPatterns?: string;
  /** Raw `NARRATIVETRACE_EXCLUDE`; present-but-empty is kept (an empty list); see `registerExcludeFromEnv`. */
  readonly exclude?: string;
  /** Service identity; see {@link serviceIdentityFromEnv} for the form contexts consume. */
  readonly serviceName?: string;
  readonly serviceVersion?: string;
  readonly environment?: string;
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
  "redactionAdditionalPatterns",
  "serviceName",
  "serviceVersion",
  "environment",
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
  const exclude = env[ENV_KEYS.exclude];
  return {
    level: parseTracingLevel(env[ENV_KEYS.level], fallbackLevel),
    ...strings,
    ...(exclude !== undefined && { exclude }),
  };
}

/**
 * The service identity the environment names, or `undefined` when none of the three settings is set.
 *
 * @param env the environment to read. @defaultValue `process.env`
 * @returns only the fields that were set, ready for a context's `serviceIdentity`.
 */
export function serviceIdentityFromEnv(env: EnvSource = process.env): ServiceIdentity | undefined {
  const { serviceName, serviceVersion, environment } = resolveEnvConfig(env);
  if (!serviceName && !serviceVersion && !environment) return undefined;
  return {
    ...(serviceName && { serviceName }),
    ...(serviceVersion && { serviceVersion }),
    ...(environment && { environment }),
  };
}
