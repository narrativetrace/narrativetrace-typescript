// SPDX-License-Identifier: BUSL-1.1
// Licensed under the Business Source License 1.1 (see LICENSE); Change Date: four years from publication; Change License: Apache-2.0
// Copyright (c) 2026 Empower Agile
import { spawnSync } from "node:child_process";
import { accessSync, constants, existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { delimiter, join } from "node:path";

/**
 * One vendor's own validator for one artifact this repository publishes, as DATA — the seam
 * ruling D6 (phase-4-design-2026-09-27.md) asks for: a registry, not one hard-coded invocation,
 * so `npx skills add` dry runs and other ports' vendor tools join as rows, never new machinery.
 */
export interface VendorCheck {
  readonly tool: string;
  /** argv (after `tool`) that proves the tool answers at all — present-but-unusable must SKIP, never fail. */
  readonly probe: readonly string[];
  /** argv (after `tool`) that performs the validation; the staged artifact root is appended last. */
  readonly validate: readonly string[];
  /** Repo-relative path of what this row validates, for the log and the report. */
  readonly artifact: string;
  /** Repo-relative paths the validation needs staged alongside the artifact. */
  readonly stagedPaths: readonly string[];
  /** One line telling a reader how to make `tool` available. */
  readonly installHint: string;
}

/** What one row's run amounted to. A skip is never a pass: nothing was validated. */
export type VendorOutcome = "passed" | "failed" | "skipped";

export interface VendorCheckResult {
  readonly tool: string;
  readonly artifact: string;
  readonly outcome: VendorOutcome;
  readonly message: string;
  readonly output: string;
}

/**
 * Every vendor validation this repository knows how to run. One row today: the plugin
 * marketplace file, validated by the agent CLI that reads it.
 */
export const CHECKS: readonly VendorCheck[] = [
  {
    tool: "claude",
    probe: ["--version"],
    validate: ["plugin", "validate"],
    artifact: ".claude-plugin/marketplace.json",
    stagedPaths: [".claude-plugin", ".claude/skills"],
    installHint: "install the agent CLI (npm i -g @anthropic-ai/claude-code) and re-run",
  },
];

/** The first executable named `name` on `pathValue` (`PATH`-delimiter separated), or `undefined`. */
export function executableOnPath(name: string, pathValue: string | undefined): string | undefined {
  for (const dir of (pathValue ?? "").split(delimiter).filter(Boolean)) {
    const candidate = join(dir, name);
    if (isExecutable(candidate)) return candidate;
  }
  return undefined;
}

function isExecutable(path: string): boolean {
  try {
    accessSync(path, constants.X_OK);
    return true;
  } catch {
    return false;
  }
}

function execute(
  executablePath: string,
  args: readonly string[],
  cwd: string,
): { exitCode: number; output: string } {
  const result = spawnSync(executablePath, args, { cwd, encoding: "utf-8" });
  const output = `${result.stdout ?? ""}${result.stderr ?? ""}`;
  return { exitCode: result.status ?? 1, output };
}

/**
 * Runs one row against `artifactRoot` (the staged tree holding the artifact), resolving `check.tool`
 * on `pathValue`. Three outcomes, in this order: the tool is absent or fails its own probe →
 * SKIPPED, naming it and {@link VendorCheck.installHint}; the validator exits zero → PASSED;
 * anything else → FAILED, carrying everything the validator printed.
 */
export function validate(
  check: VendorCheck,
  artifactRoot: string,
  pathValue: string | undefined,
): VendorCheckResult {
  const executable = executableOnPath(check.tool, pathValue);
  if (!executable) return skipped(check, "not found on PATH");

  const probeResult = execute(executable, check.probe, artifactRoot);
  if (probeResult.exitCode !== 0) {
    return skipped(
      check,
      `found at ${executable} but its own probe failed (exit ${probeResult.exitCode})`,
    );
  }

  const validateResult = execute(executable, [...check.validate, artifactRoot], artifactRoot);
  return validateResult.exitCode === 0
    ? passed(check, validateResult.output)
    : failed(check, validateResult.exitCode, validateResult.output);
}

/**
 * The whole run's verdict: FAILED when any row failed, PASSED when at least one row genuinely ran
 * clean, SKIPPED otherwise — including when there are no rows at all. A run where every vendor CLI
 * was absent validated nothing, and must never read as a pass.
 */
export function aggregate(results: readonly VendorCheckResult[]): VendorOutcome {
  if (results.some((r) => r.outcome === "failed")) return "failed";
  if (results.some((r) => r.outcome === "passed")) return "passed";
  return "skipped";
}

/**
 * Records one row's outcome under `reportsDir`, so "validated" and "never validated" stay
 * distinguishable after the fact — read back by {@link recordedStatus} rather than inferred from
 * an exit code a skip also leaves at zero.
 */
export function record(reportsDir: string, result: VendorCheckResult): void {
  mkdirSync(reportsDir, { recursive: true });
  writeFileSync(statusFile(reportsDir, result.tool), `${result.outcome}: ${result.message}\n`);
}

/** What `tool`'s last recorded run said, or `"never-ran"` when it has no record at all. */
export function recordedStatus(reportsDir: string, tool: string): string {
  const file = statusFile(reportsDir, tool);
  return existsSync(file) ? readFileSync(file, "utf-8").trim() : "never-ran";
}

function statusFile(reportsDir: string, tool: string): string {
  return join(reportsDir, `${tool}.status`);
}

/**
 * Stages `paths` out of `HEAD` into `into`: `git archive`, never the working tree, so what a
 * vendor validates is what a publish would ship — uncommitted edits are invisible here exactly as
 * they are to the publish script's own staging.
 *
 * @throws {Error} when git or tar cannot produce the tree; a validation gate that silently
 *   validated nothing would be worse than one that stops.
 */
export function stageFromHead(repoRoot: string, paths: readonly string[], into: string): void {
  mkdirSync(into, { recursive: true });
  const archive = join(into, "head.tar");
  runOrThrow(repoRoot, "git", ["archive", "--format=tar", "-o", archive, "HEAD", "--", ...paths]);
  runOrThrow(into, "tar", ["-xf", archive, "-C", into]);
}

function runOrThrow(cwd: string, command: string, args: readonly string[]): void {
  const result = spawnSync(command, args, { cwd, encoding: "utf-8" });
  if (result.status !== 0) {
    const output = `${result.stdout ?? ""}${result.stderr ?? ""}`;
    throw new Error(`${command} ${args.join(" ")} failed (exit ${result.status}): ${output}`);
  }
}

function passed(check: VendorCheck, output: string): VendorCheckResult {
  return {
    tool: check.tool,
    artifact: check.artifact,
    outcome: "passed",
    message: `validated ${check.artifact}`,
    output,
  };
}

function failed(check: VendorCheck, exitCode: number, output: string): VendorCheckResult {
  return {
    tool: check.tool,
    artifact: check.artifact,
    outcome: "failed",
    message: `${check.tool} rejected ${check.artifact} (exit ${exitCode})`,
    output,
  };
}

function skipped(check: VendorCheck, reason: string): VendorCheckResult {
  return {
    tool: check.tool,
    artifact: check.artifact,
    outcome: "skipped",
    message: `${check.tool} ${reason} — ${check.artifact} was NOT validated; ${check.installHint}`,
    output: "",
  };
}
