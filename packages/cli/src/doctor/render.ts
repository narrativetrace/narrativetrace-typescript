// SPDX-License-Identifier: BUSL-1.1
// Licensed under the Business Source License 1.1 (see LICENSE); Change Date: four years from publication; Change License: Apache-2.0
// Copyright (c) 2026 Empower Agile
import type { DoctorReport, Finding } from "./types.js";

function renderFinding(finding: Finding): string[] {
  const tag = finding.status === "fail" ? "FAIL" : "PASS";
  const lines = [`[${tag}] ${finding.id} — ${finding.message}`];
  if (finding.status === "fail") {
    lines.push(`  fix:  ${finding.fix}`, `  docs: ${finding.docUrl}`);
  }
  lines.push("");
  return lines;
}

/** Human-readable default output: one block per finding, worst-first (failures before passes). */
export function renderHuman(report: DoctorReport): string {
  const failing = report.findings.filter((f) => f.status === "fail");
  const passing = report.findings.filter((f) => f.status === "pass");
  const header = `narrativetrace doctor — ${report.findings.length} check(s), ${failing.length} finding(s)`;
  const summary =
    failing.length === 0
      ? "All checks passed."
      : `${failing.length} finding(s). Exit code ${report.exitCode}.`;
  const body = [...failing, ...passing].flatMap(renderFinding);
  return [header, "", ...body, summary].join("\n");
}

/** Machine-readable `--json` output: the report verbatim, stable field names. */
export function renderJson(report: DoctorReport): string {
  return JSON.stringify(report, null, 2);
}
