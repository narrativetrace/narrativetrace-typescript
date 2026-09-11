// SPDX-License-Identifier: BUSL-1.1
// Licensed under the Business Source License 1.1 (see LICENSE); Change Date: four years from publication; Change License: Apache-2.0
// Copyright (c) 2026 Empower Agile
import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { hostname } from "node:os";
import { dirname, join } from "node:path";

export interface CommandOutcome {
  readonly exitCode: number;
  readonly output: string;
  readonly seconds: number;
  readonly logFile: string;
}

export interface RunCommandOptions {
  readonly cwd?: string;
  readonly env?: NodeJS.ProcessEnv;
}

/**
 * Runs `command` to completion, capturing combined stdout+stderr, and always writes the full
 * output to `logFile` — a summary line on the console is not enough to diagnose a failure, and
 * this is the one place a category's output would otherwise be lost once `verify:all` has moved
 * on to the next one (mirrors the Java golden repo's `runGradleSubprocess`).
 */
export function runCommand(
  command: string,
  args: readonly string[],
  logFile: string,
  options: RunCommandOptions = {},
): CommandOutcome {
  // Created BEFORE spawning, not just before writing the log afterward: several categories pass
  // their own `--output`/`--reporter-file` path into this same directory (biome, semgrep,
  // osv-scanner) and need it to already exist while the subprocess is running, not only once it
  // has exited. Found running this against a real biome invocation — it failed with an
  // `internalError/io` rather than a missing-file it could report cleanly.
  mkdirSync(dirname(logFile), { recursive: true });
  const start = Date.now();
  const result = spawnSync(command, args, {
    cwd: options.cwd,
    env: options.env ?? process.env,
    encoding: "utf-8",
    maxBuffer: 256 * 1024 * 1024,
  });
  const output = `${result.stdout ?? ""}${result.stderr ?? ""}`;
  const seconds = (Date.now() - start) / 1000;
  writeFileSync(logFile, output);
  const exitCode = result.status ?? (result.signal ? 1 : 1);
  return { exitCode, output, seconds, logFile };
}

/** Appends the saved log path to `note` whenever `status` is not a clean pass. */
export function withLogHint(
  note: string | null,
  outcome: CommandOutcome,
  status: "passed" | "failed" | "skipped" | "not-implemented",
): string | null {
  if (status === "passed") return note;
  const hint = `full output: ${outcome.logFile}`;
  return note ? `${note}; ${hint}` : hint;
}

/** The short commit this run executed at — `"unknown"` rather than failing the run over it. */
export function shortCommit(repoRoot: string): string {
  try {
    const result = spawnSync("git", ["rev-parse", "--short", "HEAD"], {
      cwd: repoRoot,
      encoding: "utf-8",
    });
    const out = result.stdout?.trim();
    return out && out.length > 0 ? out : "unknown";
  } catch {
    return "unknown";
  }
}

/** `<hostname>-<arch>` — enough to explain a timing anomaly, nothing sensitive. */
export function hostDescriptor(): string {
  const host = process.env.HOSTNAME ?? hostname() ?? "unknown";
  return `${host}-${process.arch}`;
}

/**
 * The version this checkout declares. Unlike Java's single `gradle.properties` property, this
 * workspace's root `package.json` is private and carries no version of its own — `packages/core`
 * is the flagship package every other one depends on, so its manifest is the one source of truth
 * (same convention `tools/verify-publication.ts` falls back to when no release tag is given).
 */
export function repoVersion(repoRoot: string): string {
  const raw = JSON.parse(readFileSync(join(repoRoot, "packages/core/package.json"), "utf-8")) as {
    version: string;
  };
  return raw.version;
}

/** Reads a JSON file, or returns `undefined` when it does not exist — never throws on absence. */
export function readJsonOrUndefined<T>(path: string): T | undefined {
  if (!existsSync(path)) return undefined;
  return JSON.parse(readFileSync(path, "utf-8")) as T;
}

/**
 * Finds the first top-level `{…}` object in mixed console output — a brace-balanced scan, not a
 * "first line starting with `{`" heuristic, because a pretty-printed report (clarity-scan.ts's
 * `--json`, indented over thousands of lines) has its opening brace alone on its own line. Found
 * running this against a real clarity-scan report: the line heuristic parsed a bare `"{"` as
 * invalid JSON and silently returned zero scenarios instead of the real report.
 */
export function extractJsonObject(text: string): string | undefined {
  const start = text.indexOf("{");
  if (start === -1) return undefined;
  let depth = 0;
  let inString = false;
  let escaped = false;
  for (let i = start; i < text.length; i++) {
    const char = text[i];
    if (inString) {
      if (escaped) escaped = false;
      else if (char === "\\") escaped = true;
      else if (char === '"') inString = false;
      continue;
    }
    if (char === '"') inString = true;
    else if (char === "{") depth++;
    else if (char === "}" && --depth === 0) return text.slice(start, i + 1);
  }
  return undefined;
}
