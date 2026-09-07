// SPDX-License-Identifier: BUSL-1.1
// Licensed under the Business Source License 1.1 (see LICENSE); Change Date: four years from publication; Change License: Apache-2.0
// Copyright (c) 2026 Empower Agile
import type { SourcePathLookup } from "./context-resolver.js";
import type { Glossary } from "./glossary.js";
import { readGlossaryJson } from "./glossary-json-reader.js";
import { readTraceExport, type TranslatableTrace } from "./trace-export-reader.js";
import {
  renderTranslatedTrace,
  type TranslatedTrace,
  type TranslationGap,
} from "./trace-translation-view.js";

/** One stored trace file: where it was read from, and what it holds. */
export interface StoredTrace {
  /** Path the trace was read from; carried through so the caller can mirror the layout. */
  readonly path: string;
  /** The file's text, as `exportJson` wrote it. */
  readonly json: string;
}

/** One run of `translateTraces`: the stored traces, the vocabulary, and the target locales. */
export interface TraceTranslationRunRequest {
  /** Text of the committed `glossary.json`. */
  readonly glossaryJson: string;
  /** The stored trace files to translate. */
  readonly traces: readonly StoredTrace[];
  /** Target locale tags, in the order their output should be produced. */
  readonly locales: readonly string[];
  /** Resolves a class name to the source path its bounded context is declared by. */
  readonly sourcePathOf: SourcePathLookup;
}

/** One translated trace file, ready to be written wherever the caller keeps its locale tree. */
export interface TranslatedFile extends TranslatedTrace {
  /** Locale this file was translated into. */
  readonly locale: string;
  /** Path of the trace file it was translated from. */
  readonly path: string;
}

/** Everything one translation run produces, as text. */
export interface TraceTranslationArtifacts {
  /** One file per (locale, trace) pair, locale-major. */
  readonly files: readonly TranslatedFile[];
  /** The console summary: one line per locale, naming the curation work it uncovered. */
  readonly summary: string;
}

/** A trace file that cannot be read names itself — a run over hundreds must say which one failed. */
function readTrace(trace: StoredTrace): TranslatableTrace {
  try {
    return readTraceExport(trace.json);
  } catch (cause) {
    const reason = cause instanceof Error ? cause.message : String(cause);
    throw new TypeError(`cannot read trace '${trace.path}': ${reason}`);
  }
}

function translateInto(
  locale: string,
  model: Glossary,
  request: TraceTranslationRunRequest,
): TranslatedFile[] {
  return request.traces.map((trace) => ({
    locale,
    path: trace.path,
    ...renderTranslatedTrace({
      trace: readTrace(trace),
      model,
      locale,
      sourcePathOf: request.sourcePathOf,
    }),
  }));
}

/** English plural of a count, spelled where it is read rather than by a general pluralizer. */
function count(amount: number, singular: string): string {
  return `${amount} ${singular}${amount === 1 ? "" : "s"}`;
}

/** One locale's output, kept paired with its locale so no later step has to re-align two lists. */
interface LocaleRun {
  readonly locale: string;
  readonly files: readonly TranslatedFile[];
}

function localeSummary(run: LocaleRun): string {
  const gaps = new Set(
    run.files.flatMap((file) =>
      file.gaps.map((gap: TranslationGap) => `${gap.context} ${gap.phrase}`),
    ),
  );
  return `${count(run.files.length, "trace")} into ${run.locale}, ${count(gaps.size, "glossary gap")}`;
}

function summarize(runs: readonly LocaleRun[]): string {
  if (runs.length === 0) return "Translation: no locales configured";
  return runs
    .map(localeSummary)
    .map((line, at) => (at === 0 ? `Translation: ${line}` : `  ${line}`))
    .join("\n");
}

/**
 * Runs one `translateTraces` end to end: read the glossary, read each stored trace, render one
 * document per locale.
 *
 * INTENT: the orchestration a task runner or CLI needs, in one glossary-owned place. A pure
 * function of its inputs, so it re-runs over historical traces and always produces the same bytes.
 *
 * @param request the traces, the vocabulary, the locales and the context lookup; see
 * {@link TraceTranslationRunRequest}.
 * @returns the translated files and the console summary; see {@link TraceTranslationArtifacts}.
 * @throws {TypeError} if a trace file cannot be read; the message names the offending path, because
 * a run over hundreds of files must say which one failed.
 * @throws {Error} if the glossary document is malformed, from {@link readGlossaryJson}. Degrading
 * to an empty glossary would produce plausible-looking output in which nothing was translated.
 * @remarks Renders text and writes nothing: this package stays free of filesystem APIs, so the
 * caller owns the output layout — the plan's `traces-<locale>/` tree mirroring the trace files.
 */
export function runTraceTranslation(
  request: TraceTranslationRunRequest,
): TraceTranslationArtifacts {
  const model = readGlossaryJson(request.glossaryJson);
  const runs: LocaleRun[] = request.locales.map((locale) => ({
    locale,
    files: translateInto(locale, model, request),
  }));
  return Object.freeze({
    files: Object.freeze(runs.flatMap((run) => run.files)),
    summary: summarize(runs),
  });
}
