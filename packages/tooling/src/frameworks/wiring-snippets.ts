// SPDX-License-Identifier: BUSL-1.1
// Licensed under the Business Source License 1.1 (see LICENSE); Change Date: four years from publication; Change License: Apache-2.0
// Copyright (c) 2026 Empower Agile
import SNIPPETS from "./wiring-snippets.json" with { type: "json" };

/**
 * The wiring lines of every snippet row, keyed by the fixture they come from.
 *
 * INTENT: the doctor's fix must carry the exact lines a project adds, and those lines must never be
 * typed — they are a compiled, tested fixture's. `wiring-snippets.json` is BUILD OUTPUT of those
 * fixtures (`pnpm run framework-table-render` writes it, `pnpm run framework-table-check` fails the
 * gate while it drifts), and it is bundled into this package, so the text reaches wherever the
 * doctor runs with no repository in sight.
 */
const BY_FIXTURE: Readonly<Record<string, string>> = SNIPPETS;

/**
 * The wiring lines of the fixture at this repository-relative path.
 *
 * @throws {Error} when the carrier has no entry for it — a table row without its snippet is a
 * build defect the render check exists to catch, never a runtime case
 */
export function wiringSnippet(fixture: string): string {
  const text = BY_FIXTURE[fixture];
  if (text === undefined) {
    throw new Error(
      `wiring-snippets.json has no entry for ${fixture} — run framework-table-render`,
    );
  }
  return text;
}

/** Every carried fixture path, in the order the carrier lists them. */
export function carriedFixtures(): readonly string[] {
  return Object.keys(BY_FIXTURE);
}
