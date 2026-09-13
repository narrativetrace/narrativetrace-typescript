// SPDX-License-Identifier: BUSL-1.1
// Licensed under the Business Source License 1.1 (see LICENSE); Change Date: four years from publication; Change License: Apache-2.0
// Copyright (c) 2026 Empower Agile
import { defineConfig } from "vitest/config";

/**
 * Test-only demo package, not a library with its own importable surface beyond `src/index.ts`
 * (the hand-run entry point documentation/llms-full.md's "Core API Reference" snippet-embeds —
 * never imported by the suite, same reasoning as examples/sixty-seconds/vitest.config.ts: it has
 * top-level side effects, a fresh SyncNarrativeContext and a console.log, that a test importing
 * it would run again for free and pointlessly). `__tests__/index.test.ts` drives the identical
 * call sequence independently. No coverage floor applies (same reasoning as
 * packages/security-tests/vitest.config.ts); coverage stays enabled so a production module, if
 * one is ever added, does not go silently unmeasured.
 */
export default defineConfig({
  test: {
    coverage: {
      provider: "v8",
      include: ["src/**"],
    },
  },
});
