// SPDX-License-Identifier: BUSL-1.1
// Licensed under the Business Source License 1.1 (see LICENSE); Change Date: four years from publication; Change License: Apache-2.0
// Copyright (c) 2026 Empower Agile
import { defineConfig } from "vitest/config";

/**
 * Test-only demo package: `src/place-order.ts` is embedded into README.md's "problem" section
 * (rule 8 — docs as tests), never hand-copied there. `__tests__/place-order.test.ts` drives both
 * the "before" and "after" services independently, proving the only behavioral difference
 * between them is the deleted log lines. No coverage floor applies (same reasoning as
 * examples/core-api-reference/vitest.config.ts); coverage stays enabled so nothing under `src/`
 * goes silently unmeasured.
 */
export default defineConfig({
  test: {
    coverage: {
      provider: "v8",
      include: ["src/**"],
    },
  },
});
