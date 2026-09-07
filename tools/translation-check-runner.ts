// SPDX-License-Identifier: BUSL-1.1
// Licensed under the Business Source License 1.1 (see LICENSE); Change Date: four years from publication; Change License: Apache-2.0
// Copyright (c) 2026 Empower Agile
import { checkCompleteness } from "./translation-check-completeness.js";
import { checkAllIndex } from "./translation-check-index.js";
import { loadManifestOrUndefined, MANIFEST_PATH } from "./translation-check-manifest.js";
import { reviewSummaryLine } from "./translation-check-review.js";
import { staleness } from "./translation-check-staleness.js";
import { checkAllStructure } from "./translation-check-structure.js";

export interface TranslationCheckResult {
  readonly failures: string[];
  readonly warnings: string[];
}

/**
 * Runs the full translation platform check: staleness, completeness, structure parity, and
 * index/menu integrity, plus the always-warn unreviewed-document summary.
 *
 * @remarks Absent a manifest, degrades to the staleness-only check with one warning explaining
 * why — a repository that has not adopted the manifest yet is never broken by this gate.
 */
export function runTranslationCheck(): TranslationCheckResult {
  const stale = staleness();
  const manifest = loadManifestOrUndefined();
  if (!manifest) {
    return {
      failures: stale,
      warnings: [
        `translation-check: no manifest at ${MANIFEST_PATH} — ran the staleness-only check`,
      ],
    };
  }
  const completeness = checkCompleteness(manifest);
  const structure = checkAllStructure();
  const index = checkAllIndex(manifest);
  return {
    failures: [...stale, ...completeness.failures, ...structure.failures, ...index],
    warnings: [...completeness.warnings, ...structure.warnings, reviewSummaryLine()],
  };
}
