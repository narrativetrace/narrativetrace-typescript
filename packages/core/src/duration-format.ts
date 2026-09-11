// SPDX-License-Identifier: BUSL-1.1
// Licensed under the Business Source License 1.1 (see LICENSE); Change Date: four years from publication; Change License: Apache-2.0
// Copyright (c) 2026 Empower Agile
/**
 * Formats a duration in milliseconds for a human-readable trace line.
 *
 * INTENT: `durationMs` on a {@link TraceNode} (see `trace-node.ts`) is measured with
 * `performance.now()`, which returns a sub-millisecond fractional float
 * (`0.5849169999999901`, not `1`) — printing that raw broke the family-wide convention that
 * every runtime's human-readable renderers show a duration as `— 3ms`, not `— 3.141592ms`.
 * Rounding lives here, once, so the indented-text and Markdown renderers' `— Nms` markers, their
 * `⑂ join` wall-time lines and their sequential-async summaries all read the same rule rather
 * than each carrying its own `Math.round`.
 *
 * @remarks Deliberately not applied to structured/machine-readable export (JSON `durationMs`,
 * the Markdown frontmatter `duration_ms` field, OTel span attributes): those carry the precise
 * float for a consumer that wants it, and rounding there would silently discard data nothing
 * asked to discard. This formatter is for prose only.
 * @param durationMs a wall-clock duration in milliseconds; typically finite and non-negative, but
 * never assumed to be — `NaN`/`Infinity` degrade to `"NaNms"`/`"Infinityms"` rather than throwing.
 * @returns an integer millisecond count once the magnitude reaches 1ms (`"3ms"`), otherwise up to
 * two decimal places (`"0.58ms"`), always suffixed `ms`.
 */
export function formatDurationMs(durationMs: number): string {
  if (Math.abs(durationMs) >= 1) return `${Math.round(durationMs)}ms`;
  return `${Math.round(durationMs * 100) / 100}ms`;
}
