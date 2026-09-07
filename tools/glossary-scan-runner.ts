// SPDX-License-Identifier: BUSL-1.1
// Licensed under the Business Source License 1.1 (see LICENSE); Change Date: four years from publication; Change License: Apache-2.0
// Copyright (c) 2026 Empower Agile
import { runGlossaryHarvest } from "../packages/glossary/src/index.js";
import {
  buildScannedTrees,
  type ScannedClass,
  scanGlossarySource,
  sourcePathIndex,
} from "./glossary-scan-analyzer.js";

/**
 * Everything the scan touches outside itself, injected so a run is testable without a filesystem.
 *
 * INTENT: this is where `packages/glossary`'s "renders text, writes nothing" rule gets cashed in —
 * the harvest returns artifacts, and exactly one collaborator decides where they land.
 */
export interface ScanIo {
  /** Every scannable source file under a directory, repository-relative. */
  readonly sourceFiles: (dir: string) => string[];
  readonly readFile: (path: string) => string;
  readonly fileExists: (path: string) => boolean;
  readonly writeFile: (path: string, content: string) => void;
  readonly mkdir: (dir: string) => void;
  readonly log: (message: string) => void;
  readonly error: (message: string) => void;
}

/** One scan's resolved paths and the date its new terms are stamped with. */
export interface ScanOptions {
  /** Directory tree to scan for source. */
  readonly sourceDir: string;
  /** Directory holding the committed `glossary.json` / `glossary.md`, typically the repo root. */
  readonly glossaryDir: string;
  /** Directory receiving the volatile `glossary-usage.json`. */
  readonly outputDir: string;
  /** ISO `YYYY-MM-DD` date stamped on terms this scan adds. */
  readonly today: string;
}

const DEFAULTS = { glossaryDir: ".", outputDir: "narrativetrace-output" };

function flagValue(argv: readonly string[], name: string): string | undefined {
  const at = argv.indexOf(name);
  return at < 0 ? undefined : argv[at + 1];
}

/**
 * Parses the scan's command line.
 *
 * @param argv arguments after the script name.
 * @param today ISO date to stamp new terms with; defaults to the current UTC date.
 * @returns the resolved options, or `undefined` when `--source-dir` is missing or was given no
 * value — a scan with nothing to scan is a usage error, not an empty run.
 * @example
 * ```ts
 * parseScanArgs(["--source-dir", "packages"]);
 * ```
 */
export function parseScanArgs(
  argv: readonly string[],
  today: string = new Date().toISOString().slice(0, 10),
): ScanOptions | undefined {
  const sourceDir = flagValue(argv, "--source-dir");
  if (sourceDir === undefined || sourceDir.startsWith("--")) return undefined;
  return {
    sourceDir,
    glossaryDir: flagValue(argv, "--glossary-dir") ?? DEFAULTS.glossaryDir,
    outputDir: flagValue(argv, "--output-dir") ?? DEFAULTS.outputDir,
    today,
  };
}

function scanSources(options: ScanOptions, io: ScanIo): ScannedClass[] {
  return io
    .sourceFiles(options.sourceDir)
    .flatMap((path) => scanGlossarySource(io.readFile(path), path));
}

/** The committed glossary's text, or `undefined` when the repository has never harvested. */
function committedGlossary(options: ScanOptions, io: ScanIo): string | undefined {
  const path = `${options.glossaryDir}/glossary.json`;
  return io.fileExists(path) ? io.readFile(path) : undefined;
}

function writeArtifacts(
  options: ScanOptions,
  io: ScanIo,
  artifacts: { glossaryJson: string; glossaryMarkdown: string; usageReport: string },
): void {
  io.mkdir(options.glossaryDir);
  io.writeFile(`${options.glossaryDir}/glossary.json`, artifacts.glossaryJson);
  io.writeFile(`${options.glossaryDir}/glossary.md`, artifacts.glossaryMarkdown);
  io.mkdir(options.outputDir);
  io.writeFile(`${options.outputDir}/glossary-usage.json`, artifacts.usageReport);
}

function harvestAndWrite(options: ScanOptions, io: ScanIo, classes: ScannedClass[]): void {
  const existingJson = committedGlossary(options, io);
  const artifacts = runGlossaryHarvest({
    // Spread rather than assigned: under `exactOptionalPropertyTypes` an absent glossary is an
    // absent key, not a key holding `undefined`.
    ...(existingJson !== undefined ? { existingJson } : {}),
    trees: buildScannedTrees(classes),
    sourcePathOf: sourcePathIndex(classes),
    firstSeen: options.today,
    mode: "static",
  });
  writeArtifacts(options, io, artifacts);
  io.log(artifacts.summary);
  io.log(`Glossary: ${options.glossaryDir}/glossary.json`);
}

/**
 * Scans a source tree and merges its vocabulary into the repository's glossary.
 *
 * INTENT: the port of Java's `GlossaryScannerMain.run` — harvesting without running tests, which
 * is also the only mode that reads `@narrated` / `@onError` templates. Returns an exit code rather
 * than terminating the process, so every failure path stays reachable from a test.
 *
 * @param options resolved paths and the date to stamp new terms with.
 * @param io the filesystem and console seam.
 * @returns `0` on success — including a scan that found nothing, which is not a failure — and `1`
 * when the committed glossary cannot be read or the artifacts cannot be written.
 * @example
 * ```ts
 * process.exitCode = runGlossaryScan(options, nodeScanIo());
 * ```
 */
export function runGlossaryScan(options: ScanOptions, io: ScanIo): number {
  const classes = scanSources(options, io);
  if (classes.length === 0) {
    io.log(`No source found in ${options.sourceDir}`);
    return 0;
  }
  try {
    harvestAndWrite(options, io, classes);
    return 0;
  } catch (failure) {
    io.error(`Error: ${failure instanceof Error ? failure.message : String(failure)}`);
    return 1;
  }
}
