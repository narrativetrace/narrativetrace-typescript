// SPDX-License-Identifier: BUSL-1.1
// Licensed under the Business Source License 1.1 (see LICENSE); Change Date: four years from publication; Change License: Apache-2.0
// Copyright (c) 2026 Empower Agile
import type { ClarityIssue } from "@narrativetrace/clarity";
import type { TraceTree } from "@narrativetrace/core";
import type { SourcePathLookup } from "./context-resolver.js";
import { GLOSSARY_SCHEMA_VERSION, glossary } from "./glossary.js";
import { harvestStatic, harvestTraces } from "./glossary-harvester.js";
import { readGlossaryJson } from "./glossary-json-reader.js";
import { writeGlossaryJson } from "./glossary-json-writer.js";
import { renderGlossaryMarkdown } from "./glossary-markdown-renderer.js";
import { mergeHarvest } from "./glossary-merger.js";
import { renderGlossaryUsageReport } from "./glossary-usage-report.js";
import { nonCanonicalTermIssues } from "./non-canonical-term-issues.js";
import { formatVocabularySummary } from "./vocabulary-summary.js";
import { collectViolations } from "./vocabulary-violations.js";

/**
 * Which harvest mode one run uses.
 *
 * INTENT: names the one decision that changes what a run may read — `static` is the only mode
 * allowed to harvest narration templates, because only a scanned signature carries the raw
 * template rather than one with runtime values already interpolated.
 */
export type HarvestMode = "trace" | "static";

/** One run's inputs: what was observed, and what the repository already agreed to call things. */
export interface GlossaryHarvestRequest {
  /**
   * Text of the committed `glossary.json`, or `undefined` when the repository has none yet — the
   * first run of a repository starts from an empty glossary rather than failing.
   */
  readonly existingJson?: string;
  /** The trace trees of one suite run, or the synthetic trees of one static scan. */
  readonly trees: readonly TraceTree[];
  /** Resolves a node's class name to the source path its bounded context is declared by. */
  readonly sourcePathOf: SourcePathLookup;
  /** ISO `YYYY-MM-DD` date stamped on terms this run adds. */
  readonly firstSeen: string;
  /** Harvest mode; defaults to `trace`, the mode that must never read a template. */
  readonly mode?: HarvestMode;
}

/**
 * Everything one run produces, as text.
 *
 * INTENT: the whole output of a harvest in one value, so the caller's only remaining decision is
 * where each piece goes. Two of them are committed files and one is volatile build output; the
 * summary and issues are console/report material.
 */
export interface GlossaryHarvestArtifacts {
  /** Canonical `glossary.json` text — the committed file, byte-identical when nothing changed. */
  readonly glossaryJson: string;
  /** Rendered `glossary.md` — the human-readable view of the same glossary. */
  readonly glossaryMarkdown: string;
  /** `glossary-usage.json` text: this run's new terms, violations and usage totals. */
  readonly usageReport: string;
  /** The console vocabulary summary line, plus one line per violation. */
  readonly summary: string;
  /** `non-canonical-term` issues to fold into the clarity report; empty when nothing was violated. */
  readonly issues: readonly ClarityIssue[];
}

/** A repository with no committed glossary still has contexts — it just has none declared yet. */
function existingGlossary(existingJson: string | undefined) {
  return existingJson === undefined
    ? glossary(GLOSSARY_SCHEMA_VERSION, new Map(), [])
    : readGlossaryJson(existingJson);
}

/**
 * Runs one glossary harvest end to end: read, harvest, merge, render.
 *
 * INTENT: the orchestration a suite hook or a scanner CLI needs, in one glossary-owned place, so
 * neither has to know the order of the steps or which of them may skip. Read the committed
 * glossary (or start empty), harvest the run's trees, merge additively, and render every artifact.
 *
 * @param request the run's inputs; see {@link GlossaryHarvestRequest}.
 * @returns every artifact of the run as text; see {@link GlossaryHarvestArtifacts}.
 * @throws {TypeError} if `existingJson` is not a valid glossary document, or `firstSeen` is not an
 * ISO `YYYY-MM-DD` date. A malformed committed glossary fails the run loudly rather than being
 * silently replaced by an empty one, which would drop every curated definition in the repository.
 * @remarks Renders text and writes nothing — this package stays free of filesystem APIs so it runs
 * unchanged in a browser test run. The caller owns every file, including which directory the
 * committed pair goes in and which the volatile report goes in.
 * @example
 * ```ts
 * const artifacts = runGlossaryHarvest({
 *   existingJson: existsSync(file) ? readFileSync(file, "utf-8") : undefined,
 *   trees,
 *   sourcePathOf,
 *   firstSeen: "2026-08-13",
 * });
 * writeFileSync(file, artifacts.glossaryJson, "utf-8");
 * ```
 */
export function runGlossaryHarvest(request: GlossaryHarvestRequest): GlossaryHarvestArtifacts {
  const existing = existingGlossary(request.existingJson);
  const harvest = (request.mode === "static" ? harvestStatic : harvestTraces)(
    existing,
    request.trees,
    request.sourcePathOf,
  );
  const merge = mergeHarvest(existing, harvest, request.firstSeen);
  const violations = collectViolations(existing, merge.suppressedAliasUses);
  return Object.freeze({
    glossaryJson: writeGlossaryJson(merge.glossary),
    glossaryMarkdown: renderGlossaryMarkdown(merge.glossary),
    usageReport: renderGlossaryUsageReport(harvest, merge.newTerms, violations),
    summary: formatVocabularySummary(merge.newTerms.length, violations),
    issues: nonCanonicalTermIssues(violations),
  });
}
