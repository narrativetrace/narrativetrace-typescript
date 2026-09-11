// SPDX-License-Identifier: BUSL-1.1
// Licensed under the Business Source License 1.1 (see LICENSE); Change Date: four years from publication; Change License: Apache-2.0
// Copyright (c) 2026 Empower Agile
import { defineConfig } from "vitest/config";

/**
 * Test-only demo package, not a library with its own `src/`: `index.js`/`index-with-logger.js` are
 * the hand-run tutorial entry points (documentation/first-10-minutes.md), never imported by the
 * suite (duplicating the entry point's real side effects — a fresh `SyncNarrativeContext`,
 * `console.log` — would defeat the point of running it by hand). The one test below drives the
 * same call independently through `@narrativetrace/vitest`'s fixture. No coverage floor applies
 * (same reasoning as `packages/security-tests/vitest.config.ts`); coverage stays enabled so a
 * production module, if one is ever added under `src/`, does not go silently unmeasured.
 */
export default defineConfig({
  test: {
    coverage: {
      provider: "v8",
      include: ["src/**"],
    },
  },
});
