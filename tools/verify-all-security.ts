// SPDX-License-Identifier: BUSL-1.1
// Licensed under the Business Source License 1.1 (see LICENSE); Change Date: four years from publication; Change License: Apache-2.0
// Copyright (c) 2026 Empower Agile
import { spawnSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { type CommandOutcome, runCommand } from "./verify-all-exec.js";

function readJson<T>(path: string): T | undefined {
  if (!existsSync(path)) return undefined;
  try {
    return JSON.parse(readFileSync(path, "utf-8")) as T;
  } catch {
    return undefined;
  }
}

/** `true` iff `name` resolves on `PATH` — checked directly, no log file, unlike a real category run. */
function onPath(name: string): boolean {
  return spawnSync("sh", ["-c", `command -v ${name}`]).status === 0;
}

/**
 * Resolves a security tool the same two ways its own `scripts/*.sh` wrapper does — `PATH` first,
 * then this repo's `.tools-cache/` self-install location — without re-running that wrapper's own
 * network bootstrap a second time. `undefined` means neither exists yet; the caller reports
 * `skipped`, never attempts to install (that's the wrapper script's job, run separately below).
 */
function resolveBinary(repoRoot: string, name: string, cachedRelative: string): string | undefined {
  if (onPath(name)) return name;
  const cached = join(repoRoot, cachedRelative);
  return existsSync(cached) ? cached : undefined;
}

export interface SecretsOutcome {
  readonly outcome: CommandOutcome;
  readonly skipped: boolean;
}

/** Delegates entirely to `scripts/gitleaks.sh full` — its own self-install + skip-vs-fail logic is the real gate. */
export function runSecretsScan(repoRoot: string, logDir: string): SecretsOutcome {
  const outcome = runCommand("sh", ["scripts/gitleaks.sh", "full"], join(logDir, "secrets.log"), {
    cwd: repoRoot,
  });
  const skipped = /skipped locally/.test(outcome.output);
  return { outcome, skipped };
}

export interface SastOutcome {
  readonly outcome: CommandOutcome;
  readonly skipped: boolean;
  readonly findings: number | undefined;
}

const SEMGREP_CONFIGS = ["p/security-audit", "p/typescript", "p/javascript", "p/owasp-top-ten"];

interface SemgrepJson {
  readonly results: readonly unknown[];
}

/**
 * Runs Semgrep directly (not via `scripts/semgrep-scan.sh`) so `--json` can ride along with the
 * exact same ruleset the script gates on, giving a real `findings` count from one invocation
 * instead of running the scan twice. Falls back to the script's own bootstrap-then-skip behavior
 * when the binary isn't resolvable here — this never attempts the network install itself.
 */
export function runSastScan(repoRoot: string, logDir: string): SastOutcome {
  const bin = resolveBinary(repoRoot, "semgrep", ".tools-cache/semgrep-venv/bin/semgrep");
  if (!bin) {
    const outcome = runCommand("sh", ["scripts/semgrep-scan.sh"], join(logDir, "sast.log"), {
      cwd: repoRoot,
    });
    return { outcome, skipped: true, findings: undefined };
  }
  const jsonPath = join(logDir, "sast.json");
  const args = SEMGREP_CONFIGS.flatMap((c) => ["--config", c]);
  const outcome = runCommand(
    bin,
    [...args, "--metrics=off", "--error", "--json", "--output", jsonPath, "."],
    join(logDir, "sast.log"),
    { cwd: repoRoot },
  );
  const report = readJson<SemgrepJson>(jsonPath);
  return { outcome, skipped: false, findings: report?.results.length };
}

export interface ScaToolResult {
  readonly outcome: CommandOutcome;
  readonly skipped: boolean;
  readonly findings: number | undefined;
}

export interface ScaOutcome {
  readonly osv: ScaToolResult;
  readonly pnpmAudit: Omit<ScaToolResult, "skipped">;
}

interface OsvVulnerability {
  readonly id: string;
}
interface OsvPackageResult {
  readonly vulnerabilities?: readonly OsvVulnerability[];
}
interface OsvSourceResult {
  readonly packages?: readonly OsvPackageResult[];
}
interface OsvReport {
  readonly results: readonly OsvSourceResult[];
}

function distinctOsvFindings(report: OsvReport | undefined): number | undefined {
  if (!report) return undefined;
  const ids = new Set<string>();
  for (const source of report.results) {
    for (const pkg of source.packages ?? []) {
      for (const vuln of pkg.vulnerabilities ?? []) ids.add(vuln.id);
    }
  }
  return ids.size;
}

interface PnpmAuditReport {
  readonly metadata: { readonly vulnerabilities: Readonly<Record<string, number>> };
}

function pnpmAuditFindings(report: PnpmAuditReport | undefined): number | undefined {
  if (!report) return undefined;
  return Object.values(report.metadata.vulnerabilities).reduce((sum, n) => sum + n, 0);
}

/**
 * Two tools feed one `sca` row (the schema's composite-category convention): OSV-Scanner over
 * the real `pnpm-lock.yaml` (Java's SBOM-based scan has no lockfile-source equivalent here, so
 * `scan source --recursive` is the genuinely-analogous invocation) and `pnpm audit` against the
 * npm registry's own advisory database. Both self-installed already in this container; neither
 * re-runs `scripts/osv-scan.sh` to avoid a second network round trip for the same data.
 */
export function runScaScan(repoRoot: string, logDir: string): ScaOutcome {
  const osvBin = resolveBinary(repoRoot, "osv-scanner", ".tools-cache/osv-scanner/osv-scanner");
  const osv = runOsvScan(repoRoot, logDir, osvBin);
  const pnpmAudit = runPnpmAudit(repoRoot, logDir);
  return { osv, pnpmAudit };
}

function runOsvScan(repoRoot: string, logDir: string, bin: string | undefined): ScaToolResult {
  if (!bin) {
    const outcome = runCommand("sh", ["scripts/osv-scan.sh"], join(logDir, "sca-osv.log"), {
      cwd: repoRoot,
    });
    return { outcome, skipped: true, findings: undefined };
  }
  // `--output` is deprecated in this osv-scanner release (prints a warning and writes nothing) —
  // confirmed directly, not assumed from the deprecation notice alone. `--output-file` is real.
  const jsonPath = join(logDir, "sca-osv.json");
  const outcome = runCommand(
    bin,
    ["scan", "source", "--recursive", "--format", "json", "--output-file", jsonPath, "."],
    join(logDir, "sca-osv.log"),
    { cwd: repoRoot },
  );
  const report = readJson<OsvReport>(jsonPath);
  return { outcome, skipped: false, findings: distinctOsvFindings(report) };
}

/** `pnpm audit --json` prints pure JSON to stdout — no `--output` flag, so the log IS the data. */
function runPnpmAudit(repoRoot: string, logDir: string): Omit<ScaToolResult, "skipped"> {
  const outcome = runCommand("pnpm", ["audit", "--json"], join(logDir, "sca-pnpm-audit.json"), {
    cwd: repoRoot,
  });
  const report = parseJsonOrUndefined<PnpmAuditReport>(outcome.output);
  return { outcome, findings: pnpmAuditFindings(report) };
}

function parseJsonOrUndefined<T>(text: string): T | undefined {
  try {
    return JSON.parse(text) as T;
  } catch {
    return undefined;
  }
}
