// SPDX-License-Identifier: BUSL-1.1
// Licensed under the Business Source License 1.1 (see LICENSE); Change Date: four years from publication; Change License: Apache-2.0
// Copyright (c) 2026 Empower Agile
import {
  readGlossaryJson,
  runTraceTranslation,
  type SourcePathLookup,
  type StoredTrace,
  type TranslatedFile,
  UNASSIGNED_CONTEXT,
} from "../packages/glossary/src/index.js";
import { scanGlossarySource, sourcePathIndex } from "./glossary-scan-analyzer.js";

/** The filesystem and console seam, so every path of the run stays reachable from a test. */
export interface TranslateIo {
  /** Every `.json` file under a directory, repository-relative. */
  readonly traceFiles: (dir: string) => string[];
  /** Every scannable source file under a directory, repository-relative. */
  readonly sourceFiles: (dir: string) => string[];
  readonly readFile: (path: string) => string;
  readonly fileExists: (path: string) => boolean;
  readonly writeFile: (path: string, content: string) => void;
  readonly mkdir: (dir: string) => void;
  readonly log: (message: string) => void;
  readonly error: (message: string) => void;
}

/** One translation run's resolved paths and target locales. */
export interface TranslateOptions {
  /** Directory tree holding the stored trace exports. */
  readonly traceDir: string;
  /** Directory holding the committed `glossary.json`, typically the repo root. */
  readonly glossaryDir: string;
  /** Directory receiving the `traces-<locale>/` trees. */
  readonly outputDir: string;
  /** Locale tags to translate into, in output order. */
  readonly locales: readonly string[];
  /** Source tree to index for bounded-context resolution; absent files everything unassigned. */
  readonly sourceDir?: string;
}

const DEFAULTS = {
  traceDir: "narrativetrace-output",
  glossaryDir: ".",
  outputDir: "narrativetrace-output",
};

/**
 * Report artifacts of the product's own runs, which share the trace tree but are not traces.
 *
 * @remarks A name list rather than shape sniffing: a `.json` file in the trace tree that is *not*
 * one of these and does not parse as a trace is a corrupt trace, and must fail the run loudly.
 */
const REPORTS = new Set(["glossary-usage.json", "clarity-results.json", "glossary.json"]);

function flagValue(argv: readonly string[], name: string): string | undefined {
  const at = argv.indexOf(name);
  const value = at < 0 ? undefined : argv[at + 1];
  return value === undefined || value.startsWith("--") ? undefined : value;
}

/**
 * Parses the translation run's command line.
 *
 * @param argv arguments after the script name.
 * @returns the resolved options, or `undefined` when `--locale` is missing or was given no value —
 * a translation with no target language is a usage error, not an empty run.
 * @example
 * ```ts
 * parseTranslateArgs(["--locale", "es,de", "--source-dir", "packages"]);
 * ```
 */
export function parseTranslateArgs(argv: readonly string[]): TranslateOptions | undefined {
  const locales = flagValue(argv, "--locale");
  if (locales === undefined) return undefined;
  const sourceDir = flagValue(argv, "--source-dir");
  return {
    traceDir: flagValue(argv, "--trace-dir") ?? DEFAULTS.traceDir,
    glossaryDir: flagValue(argv, "--glossary-dir") ?? DEFAULTS.glossaryDir,
    outputDir: flagValue(argv, "--output-dir") ?? DEFAULTS.outputDir,
    locales: locales.split(",").filter((locale) => locale !== ""),
    ...(sourceDir !== undefined ? { sourceDir } : {}),
  };
}

function baseName(path: string): string {
  return path.slice(path.lastIndexOf("/") + 1);
}

function storedTraces(options: TranslateOptions, io: TranslateIo): StoredTrace[] {
  return io
    .traceFiles(options.traceDir)
    .filter((path) => path.endsWith(".json") && !REPORTS.has(baseName(path)))
    .map((path) => ({ path, json: io.readFile(path) }));
}

/**
 * Builds the class-to-source-path index bounded contexts resolve through.
 *
 * @remarks Without `--source-dir` every class is unassigned, so a glossary that declares contexts
 * would translate nothing. The run says so rather than presenting an empty translation as a result.
 */
function sourcePaths(options: TranslateOptions, io: TranslateIo): SourcePathLookup {
  if (options.sourceDir === undefined) return () => undefined;
  const classes = io
    .sourceFiles(options.sourceDir)
    .flatMap((path) => scanGlossarySource(io.readFile(path), path));
  return sourcePathIndex(classes);
}

/** `<outputDir>/traces-<locale>/<path under the trace tree>.md`. */
function outputPath(options: TranslateOptions, file: TranslatedFile): string {
  const relative = file.path.startsWith(`${options.traceDir}/`)
    ? file.path.slice(options.traceDir.length + 1)
    : baseName(file.path);
  return `${options.outputDir}/traces-${file.locale}/${relative.replace(/\.json$/, ".md")}`;
}

function writeTranslations(
  options: TranslateOptions,
  io: TranslateIo,
  files: readonly TranslatedFile[],
): void {
  for (const file of files) {
    const path = outputPath(options, file);
    io.mkdir(path.slice(0, path.lastIndexOf("/")));
    io.writeFile(path, file.markdown);
  }
}

/**
 * Says when a run's vocabulary could not be reached, and why.
 *
 * INTENT: a glossary that declares contexts translates nothing at all if class names do not resolve
 * into them, and the output of such a run looks exactly like a run against an uncurated glossary.
 * The two causes are worth naming separately: no source tree was given, or the one given produced
 * paths that no declared prefix owns — the usual cause being an absolute `--source-dir` where the
 * prefixes in `glossary.json` are repository-relative.
 */
function warnUnassigned(
  options: TranslateOptions,
  io: TranslateIo,
  glossaryJson: string,
  files: readonly TranslatedFile[],
): void {
  if (readGlossaryJson(glossaryJson).contexts.size === 0) return;
  const gaps = files.flatMap((file) => file.gaps);
  if (gaps.length === 0 || gaps.some((gap) => gap.context !== UNASSIGNED_CONTEXT)) return;
  io.log(
    options.sourceDir === undefined
      ? `Note: no --source-dir given, so every class resolved to ${UNASSIGNED_CONTEXT} and the contexts declared in glossary.json went unused`
      : `Note: every class resolved to ${UNASSIGNED_CONTEXT} — check that paths under '${options.sourceDir}' start with a package prefix declared in glossary.json`,
  );
}

function translateAndWrite(options: TranslateOptions, io: TranslateIo, glossaryPath: string): void {
  const traces = storedTraces(options, io);
  if (traces.length === 0) {
    io.log(`No traces found in ${options.traceDir}`);
    return;
  }
  const glossaryJson = io.readFile(glossaryPath);
  const artifacts = runTraceTranslation({
    glossaryJson,
    traces,
    locales: options.locales,
    sourcePathOf: sourcePaths(options, io),
  });
  writeTranslations(options, io, artifacts.files);
  io.log(artifacts.summary);
  warnUnassigned(options, io, glossaryJson, artifacts.files);
  for (const locale of options.locales) io.log(`Translated: ${options.outputDir}/traces-${locale}`);
}

/**
 * Translates every stored trace of a run into each requested locale.
 *
 * INTENT: the port of the plan's `translateTraces` task — a pure function of stored files, so it
 * re-runs over historical traces and always writes the same bytes. Returns an exit code rather
 * than terminating the process, so every failure path stays reachable from a test.
 *
 * @param options resolved paths and target locales.
 * @param io the filesystem and console seam.
 * @returns `0` on success — including a run that found no traces, which is not a failure — and `1`
 * when the repository has no committed glossary, or a trace file cannot be read.
 * @example
 * ```ts
 * process.exit(runTranslateTraces(options, nodeTranslateIo()));
 * ```
 */
export function runTranslateTraces(options: TranslateOptions, io: TranslateIo): number {
  const glossaryPath = `${options.glossaryDir}/glossary.json`;
  if (!io.fileExists(glossaryPath)) {
    io.error(`Error: no ${glossaryPath} — run glossary-scan before translating`);
    return 1;
  }
  try {
    translateAndWrite(options, io, glossaryPath);
    return 0;
  } catch (failure) {
    io.error(`Error: ${failure instanceof Error ? failure.message : String(failure)}`);
    return 1;
  }
}
