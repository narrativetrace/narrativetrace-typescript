// SPDX-License-Identifier: BUSL-1.1
// Licensed under the Business Source License 1.1 (see LICENSE); Change Date: four years from publication; Change License: Apache-2.0
// Copyright (c) 2026 Empower Agile
import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    // Root-level tests only: the architecture rules and the repo tooling under `tools/`. Every
    // package brings its own config (and its own `__tests__/setup.ts`), so without this a root run
    // would collect every package's suite a second time. Both tooling test locations are listed —
    // `tools/__tests__/` predates the root one and was collected by nothing until 2026-08-13, so a
    // pattern covering only one of them silently drops a suite.
    include: ["__tests__/**/*.test.ts", "tools/__tests__/**/*.test.ts"],
    coverage: {
      provider: "v8",
      include: ["src/**"],
      exclude: [
        "**/domain.ts",
        "**/context-snapshot.ts",
        "**/browser/app.ts",
        "**/distributed/*-entry.ts",
        "**/distributed/otel-setup.ts",
        "**/branded-types.ts",
        "**/event-pipeline.ts",
        "**/narrative-context.ts",
        "**/service-identity.ts",
        "**/trace-event.ts",
      ],
      thresholds: {
        lines: 98,
        functions: 98,
        branches: 98,
        statements: 98,
      },
    },
  },
});
