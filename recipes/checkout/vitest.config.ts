// SPDX-License-Identifier: BUSL-1.1
// Licensed under the Business Source License 1.1 (see LICENSE); Change Date: four years from publication; Change License: Apache-2.0
// Copyright (c) 2026 Empower Agile
import { defineConfig } from "vitest/config";

/**
 * Test-only recipe project, not a library with its own published `src/`: `src/` is the checkout
 * the recipe pages are written about, `__tests__/` holds each page's driver, and `fixtures/` holds
 * the runs whose whole point is to fail or to be compared against their own earlier shape — they
 * are excluded here and run, as a real Vitest process, by the driver that needs them
 * (`fixtures/vitest.config.ts`). Every file a recipe page embeds is written under
 * `narrativetrace-output/recipes/<slug>/` by `pnpm test`. No coverage floor applies (same
 * reasoning as `examples/sixty-seconds`).
 */
export default defineConfig({
  test: {
    include: ["__tests__/**/*.test.ts"],
    // A driver starts a nested Vitest and every driver writes under one output tree: one file at
    // a time keeps the runs from interleaving and the gate's worker budget honest.
    fileParallelism: false,
    // Every test here is a driver whose real cost is a nested, cold Vitest process (spawnSync), not
    // in-process work: 7–9 s each inside the publish verify container (6 GB, 4 CPUs), where seven of
    // them hit Vitest's 5,000 ms default on 2026-10-14. Release rule 3, as the glossary deep-tree tests do: a test whose
    // legitimate cost varies with scheduler contention declares what it actually needs.
    testTimeout: 30_000,
    coverage: { provider: "v8", include: ["src/**"] },
  },
});
