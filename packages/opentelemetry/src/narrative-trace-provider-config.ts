// SPDX-License-Identifier: BUSL-1.1
// Licensed under the Business Source License 1.1 (see LICENSE); Change Date: four years from publication; Change License: Apache-2.0
// Copyright (c) 2026 Empower Agile
import { type IdGeneratorLike, NarrativeTraceIdGenerator } from "./narrative-trace-id-generator.js";

export interface NarrativeTraceProviderConfigOptions {
  /** Defaults to on unless `NARRATIVETRACE_OTEL_MIRROR_IDS` is `false`; `false` here opts out. */
  readonly mirrorIds?: boolean;
  /** An id generator the caller already chose is never replaced. */
  readonly idGenerator?: IdGeneratorLike;
}

let warned = false;

function mirroringEnabled(option: boolean | undefined): boolean {
  if (option !== undefined) return option;
  const raw =
    typeof process !== "undefined" ? process.env?.NARRATIVETRACE_OTEL_MIRROR_IDS : undefined;
  return raw?.trim().toLowerCase() !== "false";
}

/**
 * Returns the tracer-provider config with {@link NarrativeTraceIdGenerator} installed, so a span's
 * OpenTelemetry id is its NarrativeTrace id without a separate wiring step.
 *
 * INTENT: spread the result into the provider constructor —
 * `new NodeTracerProvider(narrativeTraceProviderConfig({ resource }))`. Every other option passes
 * through untouched.
 *
 * @edgeCase An `idGenerator` the caller already set is kept, never overridden; a one-time warning
 * says span ids will not mirror (nothing is said when it is already a `NarrativeTraceIdGenerator`).
 * Opt out with `{ mirrorIds: false }` or `NARRATIVETRACE_OTEL_MIRROR_IDS=false`: the config is then
 * returned as given, with no generator added.
 */
export function narrativeTraceProviderConfig<T extends object = Record<string, never>>(
  config?: T & NarrativeTraceProviderConfigOptions,
): Omit<T, "mirrorIds"> & { idGenerator?: IdGeneratorLike } {
  const { mirrorIds, ...rest } = (config ?? {}) as NarrativeTraceProviderConfigOptions;
  const own = rest.idGenerator;
  if (own !== undefined) {
    if (!warned && !(own instanceof NarrativeTraceIdGenerator) && mirroringEnabled(mirrorIds)) {
      warned = true;
      console.warn(
        "NarrativeTrace: the provider config already has an idGenerator, so it is kept and " +
          "NarrativeTrace span ids will not be mirrored. Wrap or replace it with " +
          "NarrativeTraceIdGenerator to mirror them.",
      );
    }
    return rest as never;
  }
  if (!mirroringEnabled(mirrorIds)) return rest as never;
  return { ...rest, idGenerator: new NarrativeTraceIdGenerator() } as never;
}
