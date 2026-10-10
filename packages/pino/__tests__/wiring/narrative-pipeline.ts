// SPDX-License-Identifier: BUSL-1.1
// Licensed under the Business Source License 1.1 (see LICENSE); Change Date: four years from publication; Change License: Apache-2.0
// Copyright (c) 2026 Empower Agile
import { BufferedEventConsumer, DualPathPipeline } from "@narrativetrace/core";
import { createPinoEventConsumer } from "@narrativetrace/pino";
import type { Logger } from "pino";

/**
 * Build it from this project's own pino logger, and pass it wherever the project creates its
 * narrative context: new AsyncNarrativeContext(config, narrativePipeline(logger)), or a framework
 * integration's pipeline option. Every traced call is then a log line, and captureTrace() still
 * works.
 */
export function narrativePipeline(logger: Logger) {
  const levels = { enter: "info", return: "info", exception: "error" } as const;
  return new DualPathPipeline(
    createPinoEventConsumer(logger, { levels }),
    new BufferedEventConsumer(),
  );
}
