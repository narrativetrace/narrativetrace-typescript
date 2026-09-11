// SPDX-License-Identifier: BUSL-1.1
// Licensed under the Business Source License 1.1 (see LICENSE); Change Date: four years from publication; Change License: Apache-2.0
// Copyright (c) 2026 Empower Agile
import { checkMutationCompleteness } from "./verify-mutation-completeness.js";

// Per-commit gate (wired into `pnpm run check`, NOT only `verify:all`): asserts every
// `packages/*` package is either wired for mutation testing (its own `mutate` script + a
// `stryker.config.json`) or carries a written exemption. `turbo run mutate` silently skips a
// package with no `mutate` script — this is the check that turns that silence into a named
// failure, default-deny, the same discipline `coverage-completeness.ts` already applies to the
// coverage gate. Cheap by design: file/script presence only — it never runs Stryker itself; the
// full sweep stays on `pnpm run mutate` / `check:full`, same cadence rule as fuzzing.
const report = checkMutationCompleteness(process.cwd());

for (const exemption of report.exempt) {
  console.log(`EXEMPT  ${exemption.pkg}: ${exemption.reason}`);
}
for (const pkg of report.ok) {
  console.log(`OK      ${pkg}: mutate script + stryker.config.json`);
}

if (report.gaps.length > 0) {
  console.error(
    "\nMutation testing completeness check failed — neither wired for mutation testing nor exempt:",
  );
  for (const gap of report.gaps) console.error(`  [${gap.kind}] ${gap.pkg}: ${gap.detail}`);
  console.error(
    '\nFix: add a "mutate" script (`stryker run`) backed by a stryker.config.json, or add the ' +
      "package to MUTATION_EXEMPTIONS in tools/verify-mutation-completeness.ts with a written " +
      "reason — for a double-classified package, remove it from whichever of the two no longer applies.",
  );
  process.exit(1);
}

console.log(
  `\nmutation-completeness: ${report.ok.length} package(s) wired, ${report.exempt.length} exempt, 0 gaps`,
);
