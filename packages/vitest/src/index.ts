// SPDX-License-Identifier: BUSL-1.1
// Licensed under the Business Source License 1.1 (see LICENSE); Change Date: four years from publication; Change License: Apache-2.0
// Copyright (c) 2026 Empower Agile
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { analyzeClarity, exportClarityJson, type ScenarioResult } from "@narrativetrace/clarity";
import "./clarity-suite-reporter.js";
import "./glossary-suite-reporter.js";
import {
  AsyncNarrativeContext,
  BufferedEventConsumer,
  buildFailureReport,
  collectTemplateWarnings,
  DualPathPipeline,
  exportCanonicalJson,
  exportJson,
  formatTemplateWarnings,
  frameScenario,
  type NarrativeContext,
  NarrativeTraceConfig,
  renderIndentedText,
  renderMarkdown,
  resolveConfig,
  type TraceTree,
  type TracingLevel,
} from "@narrativetrace/core-node";
import { renderMermaidSequence, renderPlantUmlSequence } from "@narrativetrace/diagrams";
import { test } from "vitest";
import { type CaptureShedding, refusalNotice, shedNotice } from "./capture-shedding.js";
import { type TraceSite, traceSites } from "./glossary-suite-accumulator.js";
import { projectVocabulary } from "./project-vocabulary.js";
import { recordClarityScenario } from "./suite-clarity-accumulator.js";

export { type CaptureShedding, refusalNotice, shedNotice } from "./capture-shedding.js";
export { ClaritySuiteReporter, collectClarityEntries } from "./clarity-suite-reporter.js";
export { ConsoleSummaryReporter } from "./console-summary-reporter.js";
export {
  collectGlossarySites,
  type GlossaryArtifactSink,
  rebuildTrees,
  type SuiteGlossaryConfig,
  type SuiteGlossaryOutcome,
  type TraceSite,
  traceSites,
  writeSuiteGlossary,
} from "./glossary-suite-accumulator.js";
export {
  GlossarySuiteReporter,
  type GlossarySuiteReporterOptions,
  glossaryHarvestEnabled,
} from "./glossary-suite-reporter.js";
export {
  GLOSSARY_DIR_ENV,
  nodeFileReader,
  projectVocabulary,
  resetProjectVocabulary,
} from "./project-vocabulary.js";
export {
  clarityScenarioCount,
  drainClarityScenarios,
  recordClarityScenario,
  suiteClarityFooter,
  writeSuiteClarityArtifacts,
} from "./suite-clarity-accumulator.js";

/**
 * An artifact kind one test can emit.
 *
 * @remarks `json` is the nested chapter-tree envelope; `canonical-json` is the flat entry list of
 * `entry.schema.json` — the cross-port conformance fixture format. They describe the same trace
 * for different readers, so a run may write either or both.
 */
export type TraceFormat = "md" | "mmd" | "json" | "puml" | "clarity-json" | "canonical-json";

export type NarrativeTestOptions = {
  readonly outputDir?: string;
  readonly formats?: TraceFormat[];
  readonly level?: TracingLevel;
  /**
   * Capture-buffer size for each test's context, default {@link DEFAULT_TEST_BUFFER_CAPACITY}.
   *
   * @remarks Raise it for a test that traces more calls than the default holds — the notice printed
   * on a shed capture names the number to use. See {@link DEFAULT_TEST_BUFFER_CAPACITY} for why the
   * default is not the runtime's.
   */
  readonly bufferCapacity?: number;
};

/**
 * Capture-buffer size this integration gives each test's context: `8192` events.
 *
 * INTENT: a test is not a service. The runtime's `65536` default is sized for a long-lived process
 * absorbing production bursts; a suite creates a *fresh* context per test, and the ring is allocated
 * whole on the first traced call, so that default would charge every test in the suite for a
 * 65,536-slot allocation (measured ~99 µs against ~4 µs at this size — V8 puts a backing store over
 * ~128 KB in large-object space, and 8,192 pointers sits just under that cliff).
 *
 * @remarks The size is passed **explicitly**, from here, because the framework integration is the
 * party that knows it is building a test-shaped context. Core never sniffs for vitest or any other
 * framework: a runtime that behaves differently because it detected a test harness is a runtime
 * whose tests prove nothing about production. Override per fixture with
 * {@link NarrativeTestOptions.bufferCapacity}.
 */
export const DEFAULT_TEST_BUFFER_CAPACITY = 8192;

const FORMAT_ALIASES: Record<string, TraceFormat> = {
  md: "md",
  markdown: "md",
  json: "json",
  mmd: "mmd",
  mermaid: "mmd",
  puml: "puml",
  plantuml: "puml",
  "canonical-json": "canonical-json",
  canonicaljson: "canonical-json",
  canonical: "canonical-json",
};

function parseFormats(raw?: string): TraceFormat[] | undefined {
  if (!raw) return undefined;
  const formats = raw
    .split(",")
    .map((s) => FORMAT_ALIASES[s.trim().toLowerCase()])
    .filter((f): f is TraceFormat => f !== undefined);
  return formats.length > 0 ? formats : undefined;
}

/**
 * Artifacts emitted when nothing selects a format: the narrative, its canonical JSON, and its
 * sequence diagram — the same always-on set Java's `TraceTestSupport` writes per test. PlantUML
 * and clarity JSON stay opt-in.
 */
const DEFAULT_FORMATS: readonly TraceFormat[] = ["md", "json", "mmd"];

export interface ResolvedFixtureConfig {
  readonly level: TracingLevel;
  readonly outputDir: string;
  readonly formats: TraceFormat[];
  readonly bufferCapacity: number;
}

/**
 * Resolves the fixture's effective level/outputDir/formats/bufferCapacity across all channels,
 * highest precedence first: explicit `options` → `NARRATIVETRACE_*` env → project config file →
 * defaults. A garbage level degrades to `detail` via the lenient parser (TW4).
 *
 * @remarks `bufferCapacity` has only the options channel — it is a property of the *fixture*, not
 * of the project's tracing configuration, and a suite-wide env override would push every test past
 * the allocation cliff the default exists to stay under.
 * @throws {DuplicateConfigurationError} when the project root declares more than one config
 * source — a misconfigured project fails the run instead of silently picking one.
 */
export function resolveFixtureConfig(options: NarrativeTestOptions = {}): ResolvedFixtureConfig {
  const resolved = resolveConfig();
  return {
    level: options.level ?? resolved.level,
    outputDir: options.outputDir ?? resolved.outputDir ?? "narrativetrace-output",
    formats: options.formats ?? parseFormats(resolved.format) ?? [...DEFAULT_FORMATS],
    bufferCapacity: options.bufferCapacity ?? DEFAULT_TEST_BUFFER_CAPACITY,
  };
}

/**
 * A test-scoped context over its own explicitly-sized capture buffer, plus the buffer itself so the
 * caller can ask afterwards what it shed.
 *
 * @remarks The pipeline is built here rather than left to the context's default precisely so the
 * capacity is this integration's decision and not the runtime's — see
 * {@link DEFAULT_TEST_BUFFER_CAPACITY}.
 */
function testContext(
  bufferCapacity: number,
  level?: TracingLevel,
): { ctx: AsyncNarrativeContext; buffer: BufferedEventConsumer } {
  const buffer = new BufferedEventConsumer(bufferCapacity);
  // An omitted level falls through to NarrativeTraceConfig's own default rather than a copy of it.
  const ctx = new AsyncNarrativeContext(
    new NarrativeTraceConfig(level),
    new DualPathPipeline(null, buffer),
  );
  return { ctx, buffer };
}

export const narrativeTest = test.extend<{
  narrativeContext: NarrativeContext;
}>({
  // biome-ignore lint/correctness/noEmptyPattern: vitest fixture API requires destructuring
  narrativeContext: async ({}, use) => {
    const { ctx } = testContext(DEFAULT_TEST_BUFFER_CAPACITY);
    await use(ctx);
    // The fixture built the pipeline, so the fixture closes it: teardown is the lifecycle boundary.
    ctx.eventPipeline.close();
  },
});

interface SuiteLike {
  name: string;
  suite?: SuiteLike;
}

function buildTestPath(task: { name: string; suite?: SuiteLike }): string {
  const parts: string[] = [task.name];
  let current: SuiteLike | undefined = task.suite;
  while (current?.name) {
    parts.unshift(current.name);
    current = current.suite;
  }
  return parts.join(" > ");
}

/**
 * The artifact-grouping name for a test file — the platform stand-in for Java's test *class*,
 * since a TS test file is the unit a class is on the JVM. `src/__tests__/order-service.test.ts`
 * becomes `order-service`; a file with no resolvable path falls back to `unknown-module`.
 */
export function moduleNameOf(filepath: string | undefined): string {
  const base = filepath?.split(/[/\\]/).pop();
  if (!base) return "unknown-module";
  return base.replace(/\.(test|spec)\.[cm]?[jt]sx?$/, "").replace(/\.[cm]?[jt]sx?$/, "");
}

/** The task fields the per-test emitters read, kept structural so no Vitest type is imported. */
interface FixtureTask {
  name: string;
  suite?: SuiteLike;
  meta?: object;
  file?: { filepath?: string };
  result?: { state?: string };
}

/**
 * Everything one finished test emits: its artifact files, the two suite-reporter channels
 * (`task.meta` clarity and glossary), and the console narrative.
 *
 * INTENT: one place that knows the full per-test emission set, so adding a channel cannot quietly
 * be wired into some fixtures and not others.
 */
function emitTestArtifacts(
  tree: TraceTree,
  task: FixtureTask,
  config: Pick<ResolvedFixtureConfig, "outputDir" | "formats"> & { shedding?: CaptureShedding },
): void {
  const testName = buildTestPath(task);
  const moduleName = moduleNameOf(task.file?.filepath);
  writeTraceOutput(tree, { ...config, moduleName, testName });
  recordTestClarity(tree, testName, task.meta);
  recordTestGlossary(tree, task.meta);
  reportTestNarrative(tree, testName, task.result?.state === "fail");
  reportCaptureShedding(config.shedding);
}

export function createNarrativeTest(options: NarrativeTestOptions = {}) {
  return test.extend<{ narrativeContext: NarrativeContext }>({
    narrativeContext: async ({ task }, use) => {
      // Resolved per-test so NARRATIVETRACE_* env changes are honored at run time.
      const { level, outputDir, formats, bufferCapacity } = resolveFixtureConfig(options);
      const { ctx, buffer } = testContext(bufferCapacity, level);
      await use(ctx);
      const loss = ctx.traceLoss();
      const shedding = {
        shedEvents: buffer.overflowCount(),
        capacity: bufferCapacity,
        refusedScopes: loss.refusedScopes,
        refusedSpans: loss.refusedSpans,
      };
      emitTestArtifacts(ctx.captureTrace(), task, { outputDir, formats, shedding });
      ctx.eventPipeline.close();
    },
  });
}

/** Minimal sink so the reporter can write to a spy in tests without touching the console. */
export interface OutputSink {
  write(text: string): void;
}

/**
 * Prints the per-test narrative diagnostics a JUnit run would emit (Java `NarrativeTraceExtension`
 * parity): any unresolved-template warnings always, and on failure the framed scenario followed by
 * its IndentedText execution trace. A passing test with a clean trace prints nothing.
 */
export function reportTestNarrative(
  tree: TraceTree,
  testPath: string,
  failed: boolean,
  out: OutputSink = process.stdout,
): void {
  if (tree.roots.length === 0) return;
  const warnings = formatTemplateWarnings(collectTemplateWarnings(tree));
  if (warnings) out.write(warnings);
  if (!failed) return;
  const report = buildFailureReport(frameScenario(testPath), renderIndentedText(tree));
  out.write(`${report}\n`);
}

/**
 * Announces a capture window that overflowed its buffer; a clean capture prints nothing.
 *
 * INTENT: make load-shedding impossible to miss. It is deliberately independent of
 * {@link reportTestNarrative}'s failure gate — a *passing* test whose narrative is missing events
 * is exactly the case that would otherwise be believed.
 *
 * @param shedding what the window lost; `undefined` or a zero count prints nothing.
 * @param out where the line goes; defaults to stdout, injectable for tests.
 */
export function reportCaptureShedding(
  shedding: CaptureShedding | undefined,
  out: OutputSink = process.stdout,
): void {
  for (const notice of [shedNotice(shedding), refusalNotice(shedding)]) {
    if (notice) out.write(`${SHED_MARKER} ${notice}\n`);
  }
}

/**
 * Analyzes the test's trace and stamps the clarity scenario onto both `task.meta` (for the
 * cross-worker {@link ClaritySuiteReporter}) and the per-process registry (for a single-process
 * globalSetup teardown). An empty trace records nothing, so an empty suite produces no artifacts.
 */
function recordTestClarity(tree: TraceTree, testPath: string, meta: object | undefined): void {
  if (tree.roots.length === 0) return;
  const entry: ScenarioResult = {
    scenario: frameScenario(testPath),
    result: analyzeClarity(tree, projectVocabulary()),
  };
  // task.meta is serialized worker→reporter (see ClaritySuiteReporter); the registry is the
  // single-process fallback. TaskMeta is augmented in clarity-suite-reporter.ts.
  if (meta) (meta as { narrativeClarity?: ScenarioResult }).narrativeClarity = entry;
  recordClarityScenario(entry);
}

/**
 * Stamps the test's trace sites onto `task.meta` for the suite-end glossary harvest.
 *
 * @remarks Always recorded, never conditional on the harvest being switched on: the fixture runs
 * in a worker and the opt-in is read in the reporter, so gating here would mean reading
 * configuration twice and disagreeing about it once. Sites carry names only — no captured value
 * reaches them — so an unharvested run pays a few strings and leaks nothing.
 */
function recordTestGlossary(tree: TraceTree, meta: object | undefined): void {
  if (tree.roots.length === 0 || !meta) return;
  (meta as { narrativeGlossary?: TraceSite[] }).narrativeGlossary = traceSites(tree);
}

const RENDERERS: Record<TraceFormat, (t: TraceTree, name: string) => string> = {
  md: (t, name) => renderMarkdown(t, { scenarioName: name }),
  mmd: (t) => renderMermaidSequence(t),
  json: (t, name) => exportJson(t, { scenario: name }),
  puml: (t) => renderPlantUmlSequence(t),
  "clarity-json": (t, name) =>
    exportClarityJson(analyzeClarity(t, projectVocabulary()), { scenario: name }),
  "canonical-json": (t) => exportCanonicalJson(t),
};

/**
 * File suffix per format, where it is not the format name itself.
 *
 * @remarks `canonical-json` writes `<test>.canonical.json` so the artifact is a `.json` file to
 * every editor, viewer and schema tool that dispatches on extension — `<test>.canonical-json`
 * would be opaque to all of them.
 */
const FORMAT_EXTENSIONS: Partial<Record<TraceFormat, string>> = {
  "canonical-json": "canonical.json",
};

/** Formats that are diagrams, and so live in the mirrored `diagrams/` tree. */
const DIAGRAM_FORMATS: ReadonlySet<TraceFormat> = new Set<TraceFormat>(["mmd", "puml"]);

/** Prefixes the shed notice so it reads as a warning on every channel that carries it. */
const SHED_MARKER = "⚠️";

/**
 * How each format spells "a trailing line that is not trace data" — Markdown blockquote, Mermaid
 * `%%`, PlantUML `'`.
 *
 * @remarks The three JSON formats are absent on purpose, not by oversight. `json` is governed by
 * `schema/chapter-tree.schema.json`, which sets `additionalProperties: false` at the root and on
 * `scenario`, so there is nowhere to put a shed field without changing a cross-port format
 * contract; `canonical-json` and `clarity-json` are the same kind of artifact. Their consumers are
 * schema validators and cross-port fixtures, which read the events, not a footer — the humans who
 * need the warning read the Markdown and the console.
 *
 * That gap is closing: the chapter-tree schema will gain an optional `nt.shed` object, Java first
 * and ports following, before 0.2.0 freezes the format. When it lands, `json` stops needing a
 * footer and starts carrying the count as data.
 */
const NOTICE_SYNTAX: Partial<Record<TraceFormat, string>> = {
  md: `> ${SHED_MARKER} `,
  mmd: `%% ${SHED_MARKER} `,
  puml: `' ${SHED_MARKER} `,
};

/**
 * Appends every notice a capture produced to a rendered artifact, when the format can carry one.
 *
 * @remarks Two independent holes, two lines: a shed event and a refused async subtree have
 * different causes and different remedies, and collapsing them would misreport both.
 */
function withNotices(
  rendered: string,
  format: TraceFormat,
  notices: readonly (string | undefined)[],
): string {
  const syntax = NOTICE_SYNTAX[format];
  const lines = notices.filter((notice): notice is string => notice !== undefined);
  if (syntax === undefined || lines.length === 0) return rendered;
  return `${rendered}\n\n${lines.map((line) => `${syntax}${line}`).join("\n")}\n`;
}

/**
 * Ceiling on one sanitized path segment (module or test name). Most filesystems refuse a path
 * component over 255 bytes; a captured test/suite name can be arbitrarily long (a generated
 * property-test description, a hostile value that ended up in a test title), and sanitizing never
 * shortened it — `mkdirSync`/`writeFileSync` raised `ENAMETOOLONG` instead of writing a truncated
 * but usable artifact. Kept well under the OS limit so it survives every nesting this module adds
 * (`diagrams/`, the longest extension) with room to spare.
 */
const MAX_SEGMENT_LENGTH = 100;

function sanitizeFileName(testName: string): string {
  const safe = testName
    .replace(/[^a-zA-Z0-9\s_-]/g, "")
    .replace(/\s+/g, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, MAX_SEGMENT_LENGTH)
    .replace(/_+$/g, "");
  return safe || "unnamed_test";
}

/**
 * Where one artifact is written. Diagram formats mirror the module tree under `diagrams/`,
 * matching Java's `diagrams/<Class>/<test>.mmd`; everything else sits beside the Markdown.
 */
function targetDir(outputDir: string, moduleName: string, format: TraceFormat): string {
  const safeModule = sanitizeFileName(moduleName);
  return DIAGRAM_FORMATS.has(format)
    ? join(outputDir, "diagrams", safeModule)
    : join(outputDir, safeModule);
}

/**
 * Identifies one test's artifact set: which directory tree, which module groups it, and which
 * formats to render.
 */
export interface TraceOutputTarget {
  /** Root of the artifact tree, e.g. `narrativetrace-output`. */
  readonly outputDir: string;
  /**
   * Groups a test file's artifacts, the platform equivalent of Java's test *class* directory.
   * Derived from the test file's base name; sanitized, so a crafted path cannot escape
   * `outputDir`.
   */
  readonly moduleName: string;
  /** Full test path (suite chain + test name); sanitized into the file name. */
  readonly testName: string;
  /** Artifacts to emit. */
  readonly formats: readonly TraceFormat[];
  /**
   * What the capture window lost, if anything. A non-zero count appends a warning footer to every
   * artifact whose format can carry one (see {@link NOTICE_SYNTAX}); omitted or zero writes the
   * artifacts unchanged, so a clean capture is byte-identical to one from a caller that never
   * measured shedding.
   */
  readonly shedding?: CaptureShedding;
}

/**
 * Writes one test's trace artifacts.
 *
 * INTENT: the per-test file emitter behind {@link createNarrativeTest}, laid out like Java's
 * `TraceTestSupport` — `<outputDir>/<module>/<test>.md` plus siblings, with diagrams under
 * `<outputDir>/diagrams/<module>/`. An empty trace writes nothing at all, so a suite that
 * captured no spans leaves no directories behind.
 *
 * @param tree the captured trace; no roots means no output.
 * @param target destination and formats; see {@link TraceOutputTarget}.
 */
export function writeTraceOutput(tree: TraceTree, target: TraceOutputTarget): void {
  if (tree.roots.length === 0) return;

  const baseName = sanitizeFileName(target.testName);
  const scenario = frameScenario(target.testName);
  const notices = [shedNotice(target.shedding), refusalNotice(target.shedding)];

  for (const format of target.formats) {
    const dir = targetDir(target.outputDir, target.moduleName, format);
    const extension = FORMAT_EXTENSIONS[format] ?? format;
    mkdirSync(dir, { recursive: true });
    writeFileSync(
      join(dir, `${baseName}.${extension}`),
      withNotices(RENDERERS[format](tree, scenario), format, notices),
      "utf-8",
    );
  }
}
