// SPDX-License-Identifier: BUSL-1.1
// Licensed under the Business Source License 1.1 (see LICENSE); Change Date: four years from publication; Change License: Apache-2.0
// Copyright (c) 2026 Empower Agile
/**
 * How much a context captures, in increasing verbosity: `off` disables all capture; `errors` keeps
 * only failing paths; `summary` keeps roots and structure; `narrative` adds narration; `detail`
 * captures everything including parameter/return values.
 *
 * @remarks Ordered — compare with {@link isEnabled} rather than by string identity.
 */
export type TracingLevel = "off" | "errors" | "summary" | "narrative" | "detail";

const LEVEL_ORDER: readonly TracingLevel[] = ["off", "errors", "summary", "narrative", "detail"];

/**
 * Lenient, non-throwing parse of a level name (case-insensitive, trimmed). Blank, nullish, or
 * unrecognized input degrades to `fallback` — the single lenient parse point fed from the env
 * channel.
 */
export function parseTracingLevel(
  name: string | null | undefined,
  fallback: TracingLevel,
): TracingLevel {
  if (name == null) return fallback;
  const normalized = name.trim().toLowerCase();
  return (LEVEL_ORDER as readonly string[]).includes(normalized)
    ? (normalized as TracingLevel)
    : fallback;
}

/**
 * Whether any capture happens at `level` — i.e. anything other than `off`.
 *
 * INTENT: the fast-path guard before doing capture work; when `false`, no user code is touched.
 */
export function isActiveLevel(level: TracingLevel): boolean {
  return level !== "off";
}

/**
 * Whether `current` is verbose enough to satisfy `required`, using level ordering.
 *
 * @param current the configured level.
 * @param required the minimum level a feature needs.
 * @returns `true` when `current` ranks at or above `required` (e.g. `detail` enables `summary`).
 */
export function isEnabled(current: TracingLevel, required: TracingLevel): boolean {
  return LEVEL_ORDER.indexOf(current) >= LEVEL_ORDER.indexOf(required);
}
