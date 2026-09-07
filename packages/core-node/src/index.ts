// SPDX-License-Identifier: BUSL-1.1
// Licensed under the Business Source License 1.1 (see LICENSE); Change Date: four years from publication; Change License: Apache-2.0
// Copyright (c) 2026 Empower Agile
import { randomBytes } from "node:crypto";
import type { SpanId, TraceId } from "@narrativetrace/core";
import { registerIdGenerator } from "@narrativetrace/core";

registerIdGenerator({
  traceId: () => randomBytes(16).toString("hex") as TraceId,
  spanId: () => randomBytes(8).toString("hex") as SpanId,
});

export * from "@narrativetrace/core";
export { AsyncNarrativeContext } from "./async-context.js";
export { ENV_KEYS, type EnvConfig, resolveEnvConfig } from "./env-config.js";
export {
  type ConfigFileReader,
  DuplicateConfigurationError,
  readFileConfig,
  readProjectFile,
} from "./file-config.js";
export { type Drainable, type LifecycleEmitter, registerAutoFlush } from "./lifecycle.js";
export { type ResolveConfigOptions, resolveConfig } from "./resolve-config.js";
