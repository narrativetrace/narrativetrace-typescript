// SPDX-License-Identifier: BUSL-1.1
// Licensed under the Business Source License 1.1 (see LICENSE); Change Date: four years from publication; Change License: Apache-2.0
// Copyright (c) 2026 Empower Agile
import { defineConfig } from "vitest/config";

/**
 * The configuration the recipe drivers run a fixture under: a nested, real Vitest process that
 * collects `*-fixture.ts` and nothing else. The project's own `vitest.config.ts` never collects a
 * fixture, because what a fixture does is fail, or be approved, or be compared against its own
 * earlier shape — running it as part of the suite would fail the suite for doing what it is for.
 */
export default defineConfig({
  test: {
    include: ["fixtures/*-fixture.ts"],
    fileParallelism: false,
  },
});
