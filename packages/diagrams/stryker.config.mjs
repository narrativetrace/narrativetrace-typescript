// SPDX-License-Identifier: BUSL-1.1
// Licensed under the Business Source License 1.1 (see LICENSE); Change Date: four years from publication; Change License: Apache-2.0
// Copyright (c) 2026 Empower Agile
import { resolveStrykerConcurrency } from "../../tools/mutation-workers.mjs";

/**
 * NT_MUTATION_WORKERS / cgroup quota sized Stryker concurrency (2026-09-17 F3 finding) — never a
 * bare host-core count on a quota'd container. See `tools/mutation-workers.mjs`.
 * @type {import('@stryker-mutator/api/core').PartialStrykerOptions}
 */
export default {
  $schema:
    "https://raw.githubusercontent.com/stryker-mutator/stryker/master/packages/core/schema/stryker-core.schema.json",
  plugins: ["@stryker-mutator/vitest-runner"],
  testRunner: "vitest",
  mutate: ["src/**/*.ts"],
  reporters: ["clear-text", "json"],
  jsonReporter: { fileName: "reports/mutation/mutation.json" },
  vitest: { configFile: "vitest.config.ts" },
  thresholds: { high: 80, low: 60, break: 80 },
  concurrency: resolveStrykerConcurrency("diagrams"),
};
