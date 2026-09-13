// SPDX-License-Identifier: BUSL-1.1
// Licensed under the Business Source License 1.1 (see LICENSE); Change Date: four years from publication; Change License: Apache-2.0
// Copyright (c) 2026 Empower Agile
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { analyzeClarity, exportClarityJson, type ScenarioResult } from "@narrativetrace/clarity";
import "./clarity-suite-reporter.js";
import "./glossary-suite-reporter.js";
import "./manifest-suite-reporter.js";
import "./structural-suite-reporter.js";
import {
  type ArtifactIdentity,
  AsyncNarrativeContext,
  artifactIdentityOfInvocation,
  artifactIdentityOfMethod,
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
  type ScenarioDelta,
  type ScenarioManifestEntry,
  structuralScenario,
  type TraceTree,
  type TracingLevel,
} from "@narrativetrace/core-node";
import { renderMermaidSequence, renderPlantUmlSequence } from "@narrativetrace/diagrams";
import { type TestAPI, test } from "vitest";
import { approvalLossNote } from "./approval-loss-note.js";
import { type CaptureShedding, refusalNotice, shedNotice } from "./capture-shedding.js";
import { type TraceSite, traceSites } from "./glossary-suite-accumulator.js";
import {
  type EachRow,
  eachRowArgs,
  interpolateEachName,
  normalizeEachCases,
} from "./invocation-test.js";
import { recordManifestEntry } from "./manifest-suite-accumulator.js";
import { projectVocabulary } from "./project-vocabulary.js";
import { runIdentity } from "./run-identity-accumulator.js";
import {
  approvalRejected,
  type StructuralIo,
  type StructuralPaths,
  type StructuralWriteResult,
  structuralPaths,
  writeStructuralOutput,
} from "./structural-output.js";
import { recordStructuralDelta } from "./structural-suite-accumulator.js";
import { recordClarityScenario } from "./suite-clarity-accumulator.js";

export { approvalLossNote } from "./approval-loss-note.js";
export {
  type ApproveNarrativesIo,
  runApproveNarratives,
} from "./approve-narratives-cli.js";
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
  type EachRow,
  eachRowArgs,
  interpolateEachName,
  normalizeEachCases,
} from "./invocation-test.js";
export {
  drainManifestEntries,
  type ManifestArtifactSink,
  manifestEntryCount,
  recordManifestEntry,
  writeSuiteManifest,
} from "./manifest-suite-accumulator.js";
export {
  GLOSSARY_DIR_ENV,
  nodeFileReader,
  projectVocabulary,
  resetProjectVocabulary,
} from "./project-vocabulary.js";
export {
  approvedPathOf,
  type PromoteIo,
  promoteReceivedTraces,
} from "./promote-received-traces.js";
export { resetRunIdentityForTest, runIdentity } from "./run-identity-accumulator.js";
export {
  approvalRejected,
  type StructuralIo,
  type StructuralPaths,
  type StructuralWriteResult,
  structuralPaths,
  writeStructuralOutput,
} from "./structural-output.js";
export {
  drainStructuralDeltas,
  recordStructuralDelta,
  structuralDeltaCount,
  structuralDeltaFooterLine,
} from "./structural-suite-accumulator.js";
export {
  collectStructuralDeltas,
  StructuralSuiteReporter,
  type StructuralSuiteReporterOptions,
} from "./structural-suite-reporter.js";
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
 * `entry.schema.json` — the cross-runtime conformance fixture format. They describe the same trace
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
  /**
   * Whether {@link createNarrativeTest} writes artifact files at all, default `true`.
   *
   * @remarks The artifact IS the payoff (owner ruling, 2026-09-11): a suite that wraps a service and
   * traces it should see files without configuring anything. Set `false` — or the env/config-file
   * `output` channel to `"false"` — for the rare run that wants the console narrative and clarity/
   * glossary metadata but not the files, e.g. a read-only CI job. Any other value, including unset,
   * writes.
   */
  readonly outputEnabled?: boolean;
  /**
   * Turns on approval mode (the approval-testing idea, applied to traces): after a passing test,
   * its structure is verified against the committed `<approvedDir>/<module>/<test>.approved.nt`
   * approved trace. A missing approved trace or a structural difference fails the test and writes
   * `.received.nt` beside it for review; promote it with the `approve-narratives` script.
   * @defaultValue `false` — the same opt-in default the reference runtime uses.
   */
  readonly approval?: boolean;
  /** Directory approved/received traces live under, when {@link approval} is on. */
  readonly approvedDir?: string;
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

/**
 * `output` channel value → whether artifact files should be written.
 *
 * @remarks Inverted-default opt-out (owner ruling, 2026-09-11): everything writes except the exact
 * string `"false"` (case-insensitive, trimmed) — `undefined`, `"true"`, and legacy values like
 * `"console"` all keep writing on, so an existing `NARRATIVETRACE_OUTPUT=true` in a project's env
 * keeps working unchanged.
 */
function parseOutputEnabled(raw?: string): boolean {
  return raw?.trim().toLowerCase() !== "false";
}

/** Opt-in boolean channel (approval mode, `.structuralJson`): only the literal `"true"` turns on. */
function parseOptIn(raw?: string): boolean {
  return raw?.trim().toLowerCase() === "true";
}

/** Where approved/received traces live when no channel names a directory. */
const DEFAULT_APPROVED_DIR = "narratives";

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
  /** Whether artifact files are written at all; see {@link NarrativeTestOptions.outputEnabled}. */
  readonly outputEnabled: boolean;
  /** Whether approval mode is on; see {@link NarrativeTestOptions.approval}. */
  readonly approval: boolean;
  /** Directory approved/received traces live under; see {@link NarrativeTestOptions.approvedDir}. */
  readonly approvedDir: string;
}

/**
 * Resolves the fixture's effective level/outputDir/formats/bufferCapacity/outputEnabled across all
 * channels, highest precedence first: explicit `options` → `NARRATIVETRACE_*` env → project config
 * file → defaults. A garbage level degrades to `detail` via the lenient parser (TW4).
 *
 * @remarks `bufferCapacity` has only the options channel — it is a property of the *fixture*, not
 * of the project's tracing configuration, and a suite-wide env override would push every test past
 * the allocation cliff the default exists to stay under. `outputEnabled` defaults to `true`
 * (owner ruling, 2026-09-11: file writing is on by default, opt out with `NARRATIVETRACE_OUTPUT=false`
 * or the config file's `output: "false"`) — see {@link parseOutputEnabled}.
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
    outputEnabled: options.outputEnabled ?? parseOutputEnabled(resolved.output),
    approval: options.approval ?? parseOptIn(resolved.approval),
    approvedDir: options.approvedDir ?? resolved.approvedDir ?? DEFAULT_APPROVED_DIR,
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

/** A real, node:fs-backed {@link StructuralIo} — an absent file reads as `undefined`, never throws. */
function nodeStructuralIo(): StructuralIo {
  return {
    readFile: (path) => (existsSync(path) ? readFileSync(path, "utf-8") : undefined),
    writeFile: (path, content) => writeFileSync(path, content, "utf-8"),
    mkdir: (dir) => mkdirSync(dir, { recursive: true }),
    deleteFile: (path) => rmSync(path, { force: true }),
  };
}

function noApprovedTraceMessage(scenario: string): string {
  return (
    `No approved trace for scenario "${scenario}". Its structure was written to a .received.nt ` +
    "file; review it and run the approve-narratives script (or promote it by hand) if the change is intended."
  );
}

function changedTraceMessage(outcome: { summary: string; diff: string }): string {
  return (
    `Trace changed against the approved trace (${outcome.summary}):\n${outcome.diff}` +
    "If this change is intended, run the approve-narratives script."
  );
}

function lossyChangedTraceMessage(outcome: { diff: string }): string {
  return (
    `Trace changed against the approved trace in a way loss cannot explain:\n${outcome.diff}` +
    "This run was also incomplete, so its structure is not promotable — fix or rerun, then approve a complete run."
  );
}

/** A readable message for a rejected approval outcome — never for `"match"`/`"lossy-match"`. */
function approvalRejectionMessage(
  scenario: string,
  outcome: StructuralWriteResult["approval"],
): string {
  if (outcome?.kind === "no-approved-trace") return noApprovedTraceMessage(scenario);
  if (outcome?.kind === "changed") return changedTraceMessage(outcome);
  if (outcome?.kind === "lossy-changed") return lossyChangedTraceMessage(outcome);
  return `Approval rejected for scenario "${scenario}".`;
}

/** Config {@link writeStructuralArtifact} and {@link emitTestArtifacts} need from the fixture. */
type StructuralArtifactConfig = Pick<
  ResolvedFixtureConfig,
  "outputDir" | "approval" | "approvedDir"
>;

/**
 * One `createNarrativeTest(...).each(cases)` row's place in the invocation scheme: the 1-based
 * table position, the row's interpolated display label, and the bare (pre-interpolation) test
 * title — the family's per-invocation naming contract (`ArtifactIdentity`), never the interpolated
 * Vitest task name a `%s`/`$name` template produced.
 */
export interface InvocationInfo {
  readonly index: number;
  readonly label: string;
  readonly bareTitle: string;
}

/**
 * The artifact identity for one test: an invocation identity when {@link InvocationInfo} is given
 * (a `.each` row), otherwise the ordinary once-run identity. One function, so the generated file,
 * the console delta and the approval baseline can never disagree about a test's name.
 */
function identityFor(
  testName: string,
  moduleName: string,
  invocation: InvocationInfo | undefined,
): ArtifactIdentity {
  if (invocation === undefined) return artifactIdentityOfMethod(moduleName, testName);
  return artifactIdentityOfInvocation(
    moduleName,
    invocation.bareTitle,
    invocation.index,
    invocation.label,
  );
}

function structuralPathsFor(
  identity: ArtifactIdentity,
  config: StructuralArtifactConfig,
): StructuralPaths {
  return structuralPaths(
    identity,
    config.outputDir,
    config.approval ? config.approvedDir : undefined,
  );
}

/**
 * Records the delta on both suite-reporter channels, then enforces an approval-mode rejection.
 *
 * @throws {Error} when `result.approval` is a rejected outcome (no approved trace, or a real
 * structural difference) — never for `"match"`/`"lossy-match"`.
 */
function recordAndEnforce(
  scenario: string,
  result: StructuralWriteResult,
  meta: object | undefined,
): void {
  recordStructuralDelta(result.delta);
  if (meta)
    (meta as { narrativeStructuralDelta?: ScenarioDelta }).narrativeStructuralDelta = result.delta;
  if (approvalRejected(result.approval)) {
    throw new Error(approvalRejectionMessage(scenario, result.approval));
  }
}

/**
 * Writes the per-test structural `.nt` artifact — last-green baseline, delta accounting, and
 * (opt-in) approval-mode verification — and reports the delta on both suite-reporter channels.
 *
 * @throws {Error} when approval mode is on and the current structure was rejected (no approved
 * trace, or a real structural difference); never for an already-failed test, whose structure is
 * mid-flight and must not churn the received files.
 * @returns the last-green baseline's path relative to `outputDir` (the manifest's `structural`
 * role — 2026-09-13 ruling), or `undefined` for an empty trace, which writes nothing.
 */
interface StructuralArtifactCall {
  readonly testName: string;
  readonly moduleName: string;
  readonly config: StructuralArtifactConfig;
  readonly failed: boolean;
  readonly shedding: CaptureShedding | undefined;
  readonly meta: object | undefined;
  readonly invocation: InvocationInfo | undefined;
}

/**
 * The last-green baseline's path relative to `outputDir` — `structuralPaths` builds `lastGreen` as
 * `"<outputDir>/structural/..."`, always "/"-joined (never `node:path`'s `join`, which would use
 * `\` on Windows), so stripping the known prefix is safe.
 */
function structuralManifestPath(paths: StructuralPaths, outputDir: string): string {
  return paths.lastGreen.slice(outputDir.length + 1);
}

function writeStructuralArtifact(
  tree: TraceTree,
  call: StructuralArtifactCall,
): string | undefined {
  if (tree.roots.length === 0) return undefined;
  const identity = identityFor(call.testName, call.moduleName, call.invocation);
  const scenario = structuralScenario(identity);
  const paths = structuralPathsFor(identity, call.config);
  const lossNote = approvalLossNote(call.shedding);
  const result = writeStructuralOutput(
    tree,
    scenario,
    paths,
    call.failed,
    lossNote,
    nodeStructuralIo(),
  );
  recordAndEnforce(scenario, result, call.meta);
  return structuralManifestPath(paths, call.config.outputDir);
}

/**
 * Everything one finished test emits: its artifact files (unless {@link
 * ResolvedFixtureConfig.outputEnabled} is off), the two suite-reporter channels (`task.meta`
 * clarity and glossary), the structural `.nt` artifact + delta, and the console narrative.
 *
 * INTENT: one place that knows the full per-test emission set, so adding a channel cannot quietly
 * be wired into some fixtures and not others. `outputEnabled` gates only the file write — the
 * console narrative and the clarity/glossary metadata (neither of them a file on disk) still run,
 * so turning file output off never silences a failing test's diagnostics.
 *
 * @throws {Error} propagated from {@link writeStructuralArtifact} on an approval-mode rejection —
 * deliberately after every other emission above has already run, mirroring the reference runtime's
 * "settle the full verdict before any write, print diagnostics, then rethrow" sequencing.
 */
type EmissionConfig = Pick<ResolvedFixtureConfig, "outputDir" | "formats" | "outputEnabled"> &
  StructuralArtifactConfig & {
    shedding?: CaptureShedding | undefined;
    invocation?: InvocationInfo | undefined;
  };

function structuralCall(
  task: FixtureTask,
  config: EmissionConfig,
  testName: string,
  moduleName: string,
  failed: boolean,
): StructuralArtifactCall {
  const { shedding, invocation } = config;
  return { testName, moduleName, config, failed, shedding, meta: task.meta, invocation };
}

/**
 * Records this scenario's manifest row — the humanized scenario name, its `ArtifactIdentity`, and
 * every artifact it actually owns — on both suite-reporter channels (`task.meta`, cross-worker
 * safe, for {@link ManifestSuiteReporter}; the per-process registry, the single-process fallback),
 * the same dual write {@link recordTestClarity} uses. 2026-09-13 ruling, item 2 closed a
 * pre-existing gap: this port shipped `renderScenarioManifest` in `core` but nothing here ever
 * called it. Silent on an empty trace, matching every other per-test emission's contract.
 */
function recordManifestRow(
  tree: TraceTree,
  testName: string,
  moduleName: string,
  invocation: InvocationInfo | undefined,
  artifacts: ReadonlyMap<string, string>,
  meta: object | undefined,
): void {
  if (tree.roots.length === 0) return;
  const entry: ScenarioManifestEntry = {
    scenario: frameScenario(testName),
    identity: identityFor(testName, moduleName, invocation),
    artifacts,
  };
  if (meta)
    (meta as { narrativeManifestEntry?: ScenarioManifestEntry }).narrativeManifestEntry = entry;
  recordManifestEntry(entry);
}

function emitTestArtifacts(tree: TraceTree, task: FixtureTask, config: EmissionConfig): void {
  const testName = buildTestPath(task);
  const moduleName = moduleNameOf(task.file?.filepath);
  const { outputEnabled, invocation, ...target } = config;
  const artifacts = outputEnabled
    ? new Map(writeTraceOutput(tree, { ...target, moduleName, testName }))
    : new Map<string, string>();
  recordTestClarity(tree, testName, task.meta);
  recordTestGlossary(tree, task.meta);
  const failed = task.result?.state === "fail";
  reportTestNarrative(tree, testName, failed);
  reportCaptureShedding(config.shedding);
  const structuralPath = writeStructuralArtifact(
    tree,
    structuralCall(task, config, testName, moduleName, failed),
  );
  if (structuralPath !== undefined) artifacts.set("structural", structuralPath);
  recordManifestRow(tree, testName, moduleName, invocation, artifacts, task.meta);
}

function sheddingOf(
  ctx: AsyncNarrativeContext,
  buffer: BufferedEventConsumer,
  capacity: number,
): CaptureShedding {
  const loss = ctx.traceLoss();
  return {
    shedEvents: buffer.overflowCount(),
    capacity,
    refusedScopes: loss.refusedScopes,
    refusedSpans: loss.refusedSpans,
  };
}

/** The fixture's teardown: emit every per-test artifact, then always close the pipeline. */
async function finishNarrativeTest(
  ctx: AsyncNarrativeContext,
  buffer: BufferedEventConsumer,
  task: FixtureTask,
  config: EmissionConfig & { bufferCapacity: number },
): Promise<void> {
  const shedding = sheddingOf(ctx, buffer, config.bufferCapacity);
  try {
    emitTestArtifacts(ctx.captureTrace(), task, { ...config, shedding });
  } finally {
    ctx.eventPipeline.close();
  }
}

/** Fixtures `createNarrativeTest`'s test API injects. */
interface NarrativeContextFixtures {
  narrativeContext: NarrativeContext;
}

/** Named so its type can be emitted in a `.d.ts` without naming Vitest's own internal types. */
type NarrativeTestApi = TestAPI<NarrativeContextFixtures>;

/**
 * `createNarrativeTest(options).each(cases)`'s callable — the row's arity varies with its shape
 * (tuple vs. named-fields), so `fn` cannot be typed more precisely than this without reimplementing
 * Vitest's own generic `.each` overloads; this signature only exists to place `fixtures` last, the
 * same convention Vitest's own `.each` uses.
 */
type EachNarrativeTest = (
  cases: readonly EachRow[],
  // biome-ignore lint/suspicious/noExplicitAny: variadic row arity, see above
) => (name: string, fn: (...args: any[]) => unknown) => void;

/**
 * Builds the `narrativeContext` fixture, optionally tagged with the {@link InvocationInfo} one
 * `.each` row carries — the identity `finishNarrativeTest`/`writeStructuralArtifact` key every
 * per-invocation artifact by.
 */
function narrativeContextFixture(
  options: NarrativeTestOptions,
  invocation: InvocationInfo | undefined,
): NarrativeTestApi {
  return test.extend<NarrativeContextFixtures>({
    narrativeContext: async ({ task }, use) => {
      // Resolved per-test so NARRATIVETRACE_* env changes are honored at run time.
      const config = resolveFixtureConfig(options);
      const { ctx, buffer } = testContext(config.bufferCapacity, config.level);
      await use(ctx);
      await finishNarrativeTest(ctx, buffer, task, { ...config, invocation });
    },
  });
}

/**
 * `createNarrativeTest(options).each(cases)(name, fn)` — the parameterized-invocation counterpart
 * of `createNarrativeTest`: one real test per row, each with its own `.nt`/approval-trace identity
 * (`ArtifactIdentity.ofInvocation` — `<humanized name> #<index>` in the structural header, the
 * interpolated label in the filename), computed at registration time so it never depends on
 * execution order.
 *
 * @remarks A deliberate, documented adaptation of the reference runtime's parameterized-test
 * support: this is this port's own thin `.each` (see {@link interpolateEachName}), not Vitest's
 * native one — Vitest's built-in `.each`/`.for` give no registration-time hook to learn a row's
 * table position, which the family's cross-runtime naming scheme is keyed by. Use Vitest's own
 * `.each` when you don't need per-invocation `.nt`/approval-trace artifacts.
 */
function eachNarrativeTest(options: NarrativeTestOptions): EachNarrativeTest {
  return (cases) => (name, fn) => {
    normalizeEachCases(cases).forEach((row, i) => {
      const index = i + 1;
      const label = interpolateEachName(name, row, index);
      const rowTest = narrativeContextFixture(options, { index, label, bareTitle: name });
      // Vitest's fixture auto-injection statically requires the test body's own parameter to name
      // its fixtures via plain object destructuring (no rest, no computed keys) — `narrativeContext`
      // is the one custom fixture this test API defines, the same name every other call site in
      // this file destructures.
      rowTest(label, ({ narrativeContext }) => fn(...eachRowArgs(row), { narrativeContext }));
    });
  };
}

export function createNarrativeTest(
  options: NarrativeTestOptions = {},
): NarrativeTestApi & { each: EachNarrativeTest } {
  return Object.assign(narrativeContextFixture(options, undefined), {
    each: eachNarrativeTest(options),
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

// Only the Markdown format's frontmatter carries `run:` (2026-09-13 ruling, item 2 scopes the run
// name to "the Markdown frontmatter of every value-bearing artifact" — never JSON, never a diagram)
// — every other renderer here stays exactly as it was.
const RENDERERS: Record<TraceFormat, (t: TraceTree, name: string) => string> = {
  md: (t, name) => renderMarkdown(t, { scenarioName: name, runName: runIdentity().name }),
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

/**
 * `manifest.json`'s artifact role per format — one entry per format written, no collisions (unlike
 * Java's `ScenarioManifest`, where every text/diagram format shares one `"trace"` role because a
 * run there writes exactly one; this port's default config writes several formats at once, so `md`
 * alone keeps the pre-existing `"trace"` name and every other format keys on its own name).
 */
const MANIFEST_ROLES: Record<TraceFormat, string> = {
  md: "trace",
  mmd: "mmd",
  puml: "puml",
  json: "json",
  "canonical-json": "canonicalJson",
  "clarity-json": "clarityJson",
};

/** Prefixes the shed notice so it reads as a warning on every channel that carries it. */
const SHED_MARKER = "⚠️";

/**
 * How each format spells "a trailing line that is not trace data" — Markdown blockquote, Mermaid
 * `%%`, PlantUML `'`.
 *
 * @remarks The three JSON formats are absent on purpose, not by oversight. `json` is governed by
 * `schema/chapter-tree.schema.json`, which sets `additionalProperties: false` at the root and on
 * `scenario`, so there is nowhere to put a shed field without changing a cross-runtime format
 * contract; `canonical-json` and `clarity-json` are the same kind of artifact. Their consumers are
 * schema validators and cross-runtime fixtures, which read the events, not a footer — the humans who
 * need the warning read the Markdown and the console.
 *
 * That gap is closing: the chapter-tree schema will gain an optional `nt.shed` object across the
 * runtimes before 0.2.0 freezes the format. When it lands, `json` stops needing a
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
 * but usable artifact. Kept well under the OS limit (the family artifact-path-cap scheme's own
 * figure, shared by Java's and Swift's `OutputDirectoryResolver`) so it survives every nesting this
 * module adds (`diagrams/`, the longest extension) with room to spare.
 */
const MAX_SEGMENT_LENGTH = 100;

/**
 * `slug`, shortened to fit `maxLength` when it does not already.
 *
 * INTENT: truncation alone is a silent overwrite — two long names sharing a prefix past the cut
 * point would land on one artifact, and one test's approved baseline would then judge another
 * test's trace. The family scheme every NarrativeTrace runtime converges on (Java's and Swift's
 * `OutputDirectoryResolver`) truncates to the budget and appends an eight-hex-digit hash of the
 * whole slug, so two names differing only past the cut still resolve to different artifacts.
 * Unified onto Java's own formula (owner ruling, 2026-09-08: the family hash is Java's
 * JLS-stable `String#hashCode`, not each port improvising its own — dotnet hand-reimplements the
 * identical formula for the same reason `javaStringHashCodeHex` below does) rather than FNV-1a:
 * not a security boundary, only a cross-port collision-avoidance one, but a *shared* one is only
 * useful if every port derives the same suffix from the same slug. This runtime ASCII-folds every
 * segment before length is ever measured (see `sanitizeFileName` below), so a byte cap and a
 * character cap are the same number here — the family scheme's multibyte/astral
 * read-buffer-boundary care is structurally moot.
 */
function capped(slug: string, maxLength: number): string {
  if (slug.length <= maxLength) return slug;
  const suffix = `_${javaStringHashCodeHex(slug)}`;
  return slug.slice(0, Math.max(0, maxLength - suffix.length)) + suffix;
}

/**
 * `value`'s hash under Java's `String#hashCode()` — `s[0]*31^(n-1) + s[1]*31^(n-2) + … + s[n-1]`,
 * computed over UTF-16 code units with silent 32-bit signed overflow — as eight lowercase hex
 * digits (the two's-complement bit pattern, matching Java's own `String.format("%08x", hash)` for
 * a negative result).
 *
 * @remarks JS has no built-in equivalent, so this reimplements the formula explicitly:
 * `Math.imul` gives the exact 32-bit multiply Java's `int * int` performs (plain `*` would drift
 * once the running hash needs more than 53 bits of precision to stay exact), and `| 0` truncates
 * the addition to a 32-bit signed integer the same way Java's `int` addition wraps. This is also
 * the one NarrativeTrace runtime where the port is exact with no adaptation: the formula is
 * defined over UTF-16 code units, and a JS `string` already *is* a UTF-16 code unit sequence —
 * `charCodeAt` reads exactly what Java's `charAt`/`String#hashCode` reads, surrogate pairs
 * included, with no re-encoding step for either side to disagree over.
 */
function javaStringHashCodeHex(value: string): string {
  let hash = 0;
  for (let i = 0; i < value.length; i++) {
    hash = (Math.imul(hash, 31) + value.charCodeAt(i)) | 0;
  }
  return (hash >>> 0).toString(16).padStart(8, "0");
}

function sanitizeFileName(testName: string): string {
  const safe = testName
    .replace(/[^a-zA-Z0-9\s_-]/g, "")
    .replace(/\s+/g, "_")
    .replace(/^_+|_+$/g, "");
  return capped(safe || "unnamed_test", MAX_SEGMENT_LENGTH);
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
 * The manifest-facing path for one artifact, relative to `outputDir` — always `/`-joined
 * (`manifest.json`'s own contract, see `ScenarioManifestEntry`), unlike {@link targetDir}'s
 * `node:path.join`, which would use `\` on Windows.
 */
function relativeArtifactPath(moduleName: string, format: TraceFormat, baseName: string): string {
  const safeModule = sanitizeFileName(moduleName);
  const extension = FORMAT_EXTENSIONS[format] ?? format;
  const dirPart = DIAGRAM_FORMATS.has(format) ? `diagrams/${safeModule}` : safeModule;
  return `${dirPart}/${baseName}.${extension}`;
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
  readonly shedding?: CaptureShedding | undefined;
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
 * @returns `manifest.json` role → path relative to `outputDir`, one entry per format actually
 * written (2026-09-13 ruling, item 2's manifest wiring); empty for an empty trace.
 */
/** Writes one format's file and returns its manifest role → relative-path entry. */
function writeOneFormat(
  tree: TraceTree,
  target: TraceOutputTarget,
  format: TraceFormat,
  baseName: string,
  scenario: string,
  notices: readonly (string | undefined)[],
): readonly [string, string] {
  const dir = targetDir(target.outputDir, target.moduleName, format);
  const extension = FORMAT_EXTENSIONS[format] ?? format;
  mkdirSync(dir, { recursive: true });
  writeFileSync(
    join(dir, `${baseName}.${extension}`),
    withNotices(RENDERERS[format](tree, scenario), format, notices),
    "utf-8",
  );
  return [MANIFEST_ROLES[format], relativeArtifactPath(target.moduleName, format, baseName)];
}

export function writeTraceOutput(
  tree: TraceTree,
  target: TraceOutputTarget,
): ReadonlyMap<string, string> {
  const artifacts = new Map<string, string>();
  if (tree.roots.length === 0) return artifacts;

  const baseName = sanitizeFileName(target.testName);
  const scenario = frameScenario(target.testName);
  const notices = [shedNotice(target.shedding), refusalNotice(target.shedding)];

  for (const format of target.formats) {
    artifacts.set(...writeOneFormat(tree, target, format, baseName, scenario, notices));
  }
  return artifacts;
}
