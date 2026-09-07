// SPDX-License-Identifier: BUSL-1.1
// Licensed under the Business Source License 1.1 (see LICENSE); Change Date: four years from publication; Change License: Apache-2.0
// Copyright (c) 2026 Empower Agile
import type { ClarityIssue } from "@narrativetrace/clarity";
import {
  methodSignature,
  parameterCapture,
  returned,
  type TraceNode,
  type TraceTree,
  threw,
  traceNode,
  traceTree,
  walkPreOrder,
} from "@narrativetrace/core-node";
import { runGlossaryHarvest, type SourcePathLookup } from "@narrativetrace/glossary";
import type { SuiteArtifactSink } from "./suite-clarity-accumulator.js";

/**
 * One observed call, reduced to exactly the vocabulary a glossary harvest reads from it.
 *
 * INTENT: the cross-worker channel for glossary harvesting. A whole {@link TraceTree} cannot make
 * the trip from a Vitest worker to the main-process reporter intact — `task.meta` is serialized,
 * and a thrown `Error` arrives as a plain object whose constructor name is `Object`, silently
 * costing the run its failure vocabulary. This carries the type *name* instead, as a string, so
 * nothing depends on a class surviving serialization.
 *
 * @remarks Values are deliberately absent. A harvest reads names — of classes, methods, parameters
 * and error types — and never the data a run happened to see, which must not reach a committed
 * file.
 */
export interface TraceSite {
  readonly className: string;
  readonly methodName: string;
  readonly parameters: readonly string[];
  /** Type name of the value this call threw, when it threw one with a type name. */
  readonly errorType?: string;
}

/** JavaScript can throw anything; only an object carries a type name worth harvesting. */
function errorTypeOf(node: TraceNode): string | undefined {
  const { outcome } = node;
  if (outcome.kind !== "threw" || typeof outcome.error !== "object" || outcome.error === null) {
    return undefined;
  }
  return outcome.error.constructor?.name;
}

function siteOf(node: TraceNode): TraceSite {
  const errorType = errorTypeOf(node);
  return {
    className: node.signature.className,
    methodName: node.signature.methodName,
    parameters: node.signature.parameters.map((parameter) => parameter.name),
    ...(errorType !== undefined ? { errorType } : {}),
  };
}

/**
 * Flattens one test's trace into the serializable sites a suite-end harvest can be rebuilt from.
 *
 * @param tree the trace a test captured.
 * @returns one entry per call in depth-first order; empty for a trace with no roots.
 * @example
 * ```ts
 * task.meta.narrativeGlossary = traceSites(ctx.captureTrace());
 * ```
 */
export function traceSites(tree: TraceTree): TraceSite[] {
  const sites: TraceSite[] = [];
  walkPreOrder(
    tree.roots,
    (n) => n.children,
    (node) => {
      sites.push(siteOf(node));
    },
  );
  return sites;
}

/** A rebuilt site keeps its thrown type by name, so exception vocabulary survives the trip. */
function rebuiltNode(site: TraceSite): TraceNode {
  return traceNode(
    methodSignature(
      site.className,
      site.methodName,
      site.parameters.map((name) => parameterCapture(name, "", false)),
    ),
    site.errorType === undefined ? returned(null) : threw(namedError(site.errorType)),
    [],
  );
}

/**
 * A stand-in for a thrown value whose constructor carries the original type name.
 *
 * @remarks A harvest reads a thrown value's `constructor.name` and nothing else, so the type name
 * is all that has to be reconstructed — re-deriving a real error class from a string would be both
 * impossible and pointless.
 */
function namedError(typeName: string): Error {
  return Object.create({ constructor: { name: typeName } }) as Error;
}

/**
 * Rebuilds the trace trees a harvest walks from the sites a suite accumulated.
 *
 * INTENT: the harvester's only input shape is a trace tree, and the sites that survived
 * serialization are flat. Nesting carries no vocabulary — a harvest visits every node the same way
 * — so each site becomes its own root.
 *
 * @param sites every site the suite observed.
 * @returns one tree holding a root per site; a tree with no roots when nothing was observed.
 * @example
 * ```ts
 * harvestTraces(model, rebuildTrees(sites), sourcePathOf);
 * ```
 */
export function rebuildTrees(sites: readonly TraceSite[]): TraceTree[] {
  return [traceTree(sites.map(rebuiltNode))];
}

/** Vitest task shape the collector walks, kept structural so no Vitest type is imported. */
interface GlossaryTaskLike {
  meta?: { narrativeGlossary?: TraceSite[] };
  tasks?: GlossaryTaskLike[];
}

/**
 * Collects every test's sites from Vitest's task tree, in file-then-test order.
 *
 * INTENT: `task.meta` is serialized from workers to the main-process reporter, so this is the only
 * accumulation path that sees a whole suite — a module-level registry would see one worker's share
 * and then write a glossary that looks complete.
 *
 * @param files Vitest's finished task tree.
 * @returns every site the suite observed; empty when no test recorded any.
 */
export function collectGlossarySites(files: readonly GlossaryTaskLike[]): TraceSite[] {
  const sites: TraceSite[] = [];
  const visit = (task: GlossaryTaskLike): void => {
    sites.push(...(task.meta?.narrativeGlossary ?? []));
    for (const child of task.tasks ?? []) visit(child);
  };
  for (const file of files) visit(file);
  return sites;
}

/** Reading the committed glossary, on top of the write seam the clarity artifacts already use. */
export interface GlossaryArtifactSink extends SuiteArtifactSink {
  readonly fileExists: (path: string) => boolean;
  readonly readFile: (path: string) => string;
}

/** Where one suite's glossary artifacts go, and what date its new terms carry. */
export interface SuiteGlossaryConfig {
  /** Directory holding the committed `glossary.json` / `glossary.md`. */
  readonly glossaryDir: string;
  /** Directory receiving the volatile `glossary-usage.json`. */
  readonly outputDir: string;
  /** ISO `YYYY-MM-DD` date stamped on terms this run adds. */
  readonly today: string;
  /** Resolves a class name to its source path; without one every term is `_unassigned`. */
  readonly sourcePathOf?: SourcePathLookup;
}

/** What a suite-end harvest produced, for the reporter to print and pass on. */
export interface SuiteGlossaryOutcome {
  readonly written: boolean;
  readonly summary?: string;
  readonly issues: readonly ClarityIssue[];
}

const UNRESOLVED: SourcePathLookup = () => undefined;

/**
 * Harvests one suite's sites into the repository glossary and writes every artifact.
 *
 * INTENT: the port of Java's `GlossarySuiteHarvest` file half — the glossary package renders text
 * and writes nothing, so exactly one place decides which text becomes which file.
 *
 * @param sites everything the suite observed.
 * @param config destination directories and the harvest date.
 * @param sink the read/write seam.
 * @returns what happened; a suite that observed nothing writes nothing at all, so an unrelated
 * test run cannot rewrite a committed glossary with an empty one.
 * @example
 * ```ts
 * writeSuiteGlossary(collectGlossarySites(files), config, sink);
 * ```
 */
export function writeSuiteGlossary(
  sites: readonly TraceSite[],
  config: SuiteGlossaryConfig,
  sink: GlossaryArtifactSink,
): SuiteGlossaryOutcome {
  if (sites.length === 0) return { written: false, issues: [] };
  const glossaryFile = `${config.glossaryDir}/glossary.json`;
  const artifacts = runGlossaryHarvest({
    ...(sink.fileExists(glossaryFile) ? { existingJson: sink.readFile(glossaryFile) } : {}),
    trees: rebuildTrees(sites),
    sourcePathOf: config.sourcePathOf ?? UNRESOLVED,
    firstSeen: config.today,
  });
  sink.mkdir(config.glossaryDir);
  sink.writeFile(glossaryFile, artifacts.glossaryJson);
  sink.writeFile(`${config.glossaryDir}/glossary.md`, artifacts.glossaryMarkdown);
  sink.mkdir(config.outputDir);
  sink.writeFile(`${config.outputDir}/glossary-usage.json`, artifacts.usageReport);
  return { written: true, summary: artifacts.summary, issues: artifacts.issues };
}
