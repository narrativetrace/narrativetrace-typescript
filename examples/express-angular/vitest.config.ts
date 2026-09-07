// SPDX-License-Identifier: BUSL-1.1
// Licensed under the Business Source License 1.1 (see LICENSE); Change Date: four years from publication; Change License: Apache-2.0
// Copyright (c) 2026 Empower Agile
import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    setupFiles: ["./__tests__/setup.ts"],
    environment: "jsdom",
    coverage: {
      provider: "v8",
      include: ["server/**", "client/**"],
      exclude: ["**/entry.ts", "**/main.ts", "**/app.component.ts"],
      thresholds: {
        perFile: true,
        lines: 80,
        functions: 80,
        branches: 80,
        statements: 80,
      },
    },
  },
});
