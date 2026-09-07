// SPDX-License-Identifier: BUSL-1.1
// Licensed under the Business Source License 1.1 (see LICENSE); Change Date: four years from publication; Change License: Apache-2.0
// Copyright (c) 2026 Empower Agile
import { runTranslationCheck } from "./translation-check-runner.js";

const result = runTranslationCheck();
for (const warning of result.warnings) console.log(warning);

if (result.failures.length > 0) {
  console.error("\nTranslation check failed (see the translation platform's conventions):");
  for (const failure of result.failures) console.error(`  ${failure}`);
  process.exit(1);
}

console.log(
  "translation-check: all translated documents are in sync, complete, and correctly indexed",
);
