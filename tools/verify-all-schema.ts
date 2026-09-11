// SPDX-License-Identifier: BUSL-1.1
// Licensed under the Business Source License 1.1 (see LICENSE); Change Date: four years from publication; Change License: Apache-2.0
// Copyright (c) 2026 Empower Agile
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";

/**
 * The fixed shape every `verifyAll`/equivalent report commits to across the NarrativeTrace
 * family (pro repo TODO §35E). The contract is written once, in the Java golden repo's
 * `reports/verification/SCHEMA.md` — this module is this port's implementation of it, not a
 * second definition of it: same field names, same four statuses, same 21 category ids. A
 * category this runtime lacks still gets a row (`not-implemented`), never a missing one.
 */
export const VERIFICATION_CATEGORIES = [
  "unit-tests",
  "coverage",
  "mutation",
  "property",
  "fuzz-tier-a",
  "fuzz-tier-b",
  "benchmarks",
  "allocation",
  "architecture",
  "stress-short",
  "stress-long",
  "conformance",
  "secrets",
  "sast",
  "sca",
  "lint",
  "format",
  "types",
  "complexity",
  "translation",
  "clarity",
] as const;

export type VerificationCategory = (typeof VERIFICATION_CATEGORIES)[number];

export const VERIFICATION_STATUSES = ["passed", "failed", "skipped", "not-implemented"] as const;
export type VerificationStatus = (typeof VERIFICATION_STATUSES)[number];

export interface CategoryResult {
  readonly category: VerificationCategory;
  readonly tool: string;
  readonly status: VerificationStatus;
  readonly metrics: Readonly<Record<string, number>>;
  readonly durationSeconds: number;
  readonly note: string | null;
}

export interface VerificationRun {
  readonly runtime: string;
  readonly version: string;
  readonly commit: string;
  readonly host: string;
  readonly startedAt: string;
  readonly endedAt: string;
  readonly categories: readonly CategoryResult[];
}

interface ReportCategoryJson {
  readonly category: string;
  readonly tool: string;
  readonly status: string;
  readonly metrics: Readonly<Record<string, unknown>>;
  readonly duration_seconds: number;
  readonly note: string | null;
}

interface ReportJson {
  readonly runtime: string;
  readonly version: string;
  readonly commit: string;
  readonly host: string;
  readonly started_at: string;
  readonly ended_at: string;
  readonly overall_status: string;
  readonly categories: readonly ReportCategoryJson[];
}

/** `"failed"` iff at least one row failed — a `skipped`/`not-implemented` row never taints it. */
export function overallStatus(categories: readonly CategoryResult[]): "passed" | "failed" {
  return categories.some((c) => c.status === "failed") ? "failed" : "passed";
}

function toReportJson(run: VerificationRun): ReportJson {
  return {
    runtime: run.runtime,
    version: run.version,
    commit: run.commit,
    host: run.host,
    started_at: run.startedAt,
    ended_at: run.endedAt,
    overall_status: overallStatus(run.categories),
    categories: run.categories.map((row) => ({
      category: row.category,
      tool: row.tool,
      status: row.status,
      metrics: row.metrics,
      duration_seconds: row.durationSeconds,
      note: row.note,
    })),
  };
}

/** Writes `path`, creating parent directories as needed. The one writer of the report JSON. */
export function writeVerificationJson(run: VerificationRun, path: string): void {
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, `${JSON.stringify(toReportJson(run), null, 2)}\n`);
}

/** @throws {Error} when `path` is missing or not valid JSON. */
export function readVerificationJson(path: string): ReportJson {
  return JSON.parse(readFileSync(path, "utf-8")) as ReportJson;
}

function statusBadge(status: string): string {
  return status === "failed" ? "**FAILED**" : status;
}

function metricsCell(metrics: Readonly<Record<string, unknown>>): string {
  const entries = Object.entries(metrics);
  return entries.length === 0 ? "—" : entries.map(([k, v]) => `${k}=${v}`).join("; ");
}

function renderRow(row: ReportCategoryJson): string {
  const note = row.note ?? "";
  const duration = row.duration_seconds.toFixed(1);
  return `| ${row.category} | ${row.tool} | ${statusBadge(row.status)} | ${duration} | ${metricsCell(row.metrics)} | ${note} |`;
}

/**
 * Renders the human table straight from `path` — reads the just-written JSON back rather than
 * taking a {@link VerificationRun} the caller already has, so the Markdown is provably a
 * rendering of the committed JSON, never a second, independently computed account of the same
 * run (mirrors Java's `VerificationReportSupport.renderMarkdown`).
 */
export function renderMarkdown(path: string): string {
  const root = readVerificationJson(path);
  const lines = [
    `# Verification run — ${root.runtime} ${root.version}`,
    "",
    `- commit: \`${root.commit}\``,
    `- host: ${root.host}`,
    `- started: ${root.started_at}`,
    `- ended: ${root.ended_at}`,
    `- **overall status: ${root.overall_status}**`,
    "",
    "| Category | Tool | Status | Duration (s) | Metrics | Note |",
    "|---|---|---|---|---|---|",
    ...root.categories.map(renderRow),
  ];
  return `${lines.join("\n")}\n`;
}
