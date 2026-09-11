// SPDX-License-Identifier: BUSL-1.1
// Licensed under the Business Source License 1.1 (see LICENSE); Change Date: four years from publication; Change License: Apache-2.0
// Copyright (c) 2026 Empower Agile
import { checkCoverageCompleteness } from "./verify-coverage-completeness.js";

// Per-commit gate (wired into `pnpm run check`, NOT only `verify:all`): asserts every
// `packages/*` package is either gated by the shared coverage baseline or carries a written
// exemption. `turbo run coverage` silently skips a package with no `coverage` script — this is
// the check that turns that silence into a named failure.
const report = checkCoverageCompleteness(process.cwd());

for (const exemption of report.exempt) {
  console.log(`EXEMPT  ${exemption.pkg}: ${exemption.reason}`);
}
for (const pkg of report.ok) {
  console.log(`OK      ${pkg}: coverage script + shared baseline`);
}

if (report.gaps.length > 0) {
  console.error(
    "\nCoverage completeness check failed — neither gated by the shared coverage baseline nor exempt:",
  );
  for (const gap of report.gaps) console.error(`  [${gap.kind}] ${gap.pkg}: ${gap.detail}`);
  console.error(
    '\nFix: add a "coverage" script whose vitest.config.ts imports packageCoverage from ' +
      "vitest.coverage.shared.ts (as-is, or spread with a dated ratchet comment), or add the " +
      "package to COVERAGE_EXEMPTIONS in tools/verify-coverage-completeness.ts with a written reason.",
  );
  process.exit(1);
}

console.log(
  `\ncoverage-completeness: ${report.ok.length} package(s) baselined, ${report.exempt.length} exempt, 0 gaps`,
);
