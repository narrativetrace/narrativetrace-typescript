// SPDX-License-Identifier: BUSL-1.1
// Licensed under the Business Source License 1.1 (see LICENSE); Change Date: four years from publication; Change License: Apache-2.0
// Copyright (c) 2026 Empower Agile
import type { TracingLevel } from "./tracing-level.js";

/**
 * Mutable holder for the active {@link TracingLevel}, shared by a context and its forked children so
 * a level change takes effect everywhere at once.
 *
 * INTENT: construct once per application/request and hand to contexts and renderers; flip `level`
 * to raise or silence capture at runtime.
 *
 * @remarks Defaults to `"detail"` (capture everything) when no level is supplied.
 */
export class NarrativeTraceConfig {
  private _level: TracingLevel;

  constructor(level: TracingLevel = "detail") {
    this._level = level;
  }

  get level(): TracingLevel {
    return this._level;
  }

  set level(value: TracingLevel) {
    this._level = value;
  }
}
