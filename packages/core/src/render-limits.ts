// SPDX-License-Identifier: BUSL-1.1
// Licensed under the Business Source License 1.1 (see LICENSE); Change Date: four years from publication; Change License: Apache-2.0
// Copyright (c) 2026 Empower Agile
// The core compiles without a DOM or Node lib; `console` is the one host global the diagnostic needs.
declare const console: { warn(message: string): void };

const reported = new Set<string>();

/**
 * Clamps every named renderer limit below zero to `0` and says so once on the warn channel.
 *
 * INTENT: the limits contract (B-207): a limit is a size, so a negative
 * one is clamped to `0` rather than trusted -- unclamped, `slice(0, -1)` silently dropped only the
 * last item (or character) and left every other one standing. One line per distinct set of clamped
 * limits, naming each limit and the value it was given; options with valid limits say nothing.
 *
 * @llmNote The renderers resolve their options per call (there is no renderer object to construct),
 * so the line is deduplicated per process on its text: the same bad configuration reports once, not
 * once per rendered value. The depth cap of the flat renderer and the node budget are constants of
 * the walk and cannot be set, so they are never named here; the structured `maxDepth` option is.
 *
 * @param resolved options already merged over the defaults.
 * @param names the numeric limit options this renderer exposes.
 * @returns `resolved` itself when nothing was negative, else a copy with the negatives set to `0`.
 */
export function clampLimits<T extends object>(resolved: T, names: readonly (keyof T)[]): T {
  const negative = names.filter((name) => (resolved[name] as number) < 0);
  if (negative.length === 0) return resolved;
  const clamped = { ...resolved };
  for (const name of negative) clamped[name] = 0 as T[keyof T];
  reportOnce(
    `renderer limits below zero are clamped to 0: ${negative.map((name) => `${String(name)}=${resolved[name]}`).join(", ")}`,
  );
  return clamped;
}

function reportOnce(message: string): void {
  if (reported.has(message)) return;
  reported.add(message);
  console.warn(`[narrativetrace] ${message}`);
}

/** Forgets which clamps were already reported -- a test hook; production reports once per process. */
export function resetRenderLimitReports(): void {
  reported.clear();
}
