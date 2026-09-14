// SPDX-License-Identifier: BUSL-1.1
// Licensed under the Business Source License 1.1 (see LICENSE); Change Date: four years from publication; Change License: Apache-2.0
// Copyright (c) 2026 Empower Agile
import { defineConfig } from "vitest/config";
import { packageCoverage } from "../../vitest.coverage.shared";

export default defineConfig({
  test: {
    exclude: ["**/node_modules/**", "**/.stryker-tmp/**"],
    coverage: {
      ...packageCoverage,
      // The Tier B eval runner's own code is ordinary source held to the same floor as src/** —
      // the harness-design ruling "everything a skill invokes is normal source code"
      // (evals/README.md). Listed explicitly rather than a blanket "evals/*.ts": every module
      // with real logic is here, but evals/run.ts (the 3-line CLI shim over runner.ts's
      // runCli()) is deliberately left out — same as this repo's tools/*-cli.ts shims, there is
      // nothing in it to unit-test or mutate. Case CONTENT one level down (prompt.md,
      // graders/*.sh, fixtures/**, trigger.yaml, case.json) is data, stays out of coverage and
      // mutation — the catalogue's existing wording-exclusion ruling.
      include: [
        ...packageCoverage.include,
        "evals/agent-command.ts",
        "evals/runner.ts",
        "evals/platform-presets.ts",
        "evals/quota.ts",
        "evals/tier-precondition.ts",
      ],
    },
  },
});
