// SPDX-License-Identifier: BUSL-1.1
// Licensed under the Business Source License 1.1 (see LICENSE); Change Date: four years from publication; Change License: Apache-2.0
// Copyright (c) 2026 Empower Agile
import {
  type MethodSignature,
  type TraceNode,
  type TraceOutcome,
  type TraceTree,
  walkPreOrder,
} from "@narrativetrace/core";
import { contextOfClass, type SourcePathLookup } from "./context-resolver.js";
import type { Glossary } from "./glossary.js";
import { type HarvestCandidate, harvestCandidate } from "./harvest-candidate.js";
import { observationKey } from "./term-key.js";
import { TERM_KINDS, type TermKind } from "./term-kind.js";
import {
  classCandidate,
  exceptionCandidate,
  methodCandidates,
  parameterCandidate,
  type TermCandidate,
} from "./term-normalizer.js";
import { compareText } from "./text-order.js";

/** An observation under construction, before its count is final and it is frozen. */
interface Observation {
  readonly context: string;
  readonly phrase: string;
  readonly kind: TermKind;
  readonly site: string;
  readonly identifier: string;
  occurrences: number;
}

/**
 * Best-effort filter: synthetic node names like `<launcher>` name no domain concept.
 *
 * @remarks The trailing lookahead requires at least one letter or digit somewhere in the name, not
 * just a legal identifier shape. `_`, `$` and `__` are syntactically valid identifiers — exactly
 * the shapes a minifier, a Kotlin unused-parameter placeholder or a bundler's scope-hoisting rename
 * produces — but they tokenize to no word at all, and `classCandidate`/`methodCandidates`/etc.
 * throw their declared `TypeError` guard for precisely that input. Without this, one such name
 * anywhere in a run crashed the whole harvest; with it, the same "not an identifier worth
 * harvesting" skip that already covers `<launcher>` covers these too.
 */
const IDENTIFIER = /^(?=.*[\p{L}\p{N}])[\p{L}_$][\p{L}\p{N}_$]*$/u;

function isIdentifier(name: string): boolean {
  return IDENTIFIER.test(name);
}

/**
 * Accumulates the observations of one harvest, counting repeats of the identical sighting.
 *
 * INTENT: the aggregation rule — what makes two sightings "the same" — lives in exactly one place,
 * so no walker can invent a second one. Internal to harvesting.
 */
interface Collector {
  /** Records one sighting; a `candidate` of `undefined` — normalization found nothing — is a no-op. */
  readonly observe: (
    context: string,
    candidate: TermCandidate | undefined,
    site: string,
    identifier: string,
  ) => void;
  /** Returns everything observed so far, in canonical harvest order, frozen. */
  readonly drain: () => readonly HarvestCandidate[];
}

function collector(): Collector {
  const observations = new Map<string, Observation>();
  return {
    observe(context, candidate, site, identifier) {
      if (candidate === undefined) return;
      const { phrase, kind } = candidate;
      const key = observationKey([context, phrase, kind, site, identifier]);
      const seen = observations.get(key);
      if (seen === undefined) {
        observations.set(key, { context, phrase, kind, site, identifier, occurrences: 1 });
      } else {
        seen.occurrences += 1;
      }
    },
    drain: () =>
      Object.freeze(
        [...observations.values()].sort(compareObservations).map((each) => harvestCandidate(each)),
      ),
  };
}

function observeClass(into: Collector, context: string, className: string): void {
  if (!isIdentifier(className)) return;
  into.observe(context, classCandidate(className), className, className);
}

function observeMethod(into: Collector, context: string, methodName: string, site: string): void {
  if (!isIdentifier(methodName)) return;
  for (const candidate of methodCandidates(methodName)) {
    into.observe(context, candidate, site, methodName);
  }
}

function observeParameters(
  into: Collector,
  context: string,
  signature: MethodSignature,
  site: string,
): void {
  for (const parameter of signature.parameters) {
    if (isIdentifier(parameter.name)) {
      into.observe(context, parameterCandidate(parameter.name), site, parameter.name);
    }
  }
}

/**
 * The runtime type name of a thrown value, when it has one.
 *
 * @remarks JavaScript can throw anything, so the class name the Java runtime always has is only
 * available for objects — a thrown string or number carries no type vocabulary worth harvesting.
 * A prototype-less object has no constructor either, hence the optional access on the last line.
 */
function thrownTypeName(outcome: TraceOutcome): string | undefined {
  // The `kind` test is what narrows `outcome` for the compiler; at runtime the `typeof` test
  // already covers it, since no other outcome carries an `error`. Mutating it away is equivalent.
  if (outcome.kind !== "threw" || typeof outcome.error !== "object" || outcome.error === null) {
    return undefined;
  }
  return outcome.error.constructor?.name;
}

function observeException(
  into: Collector,
  context: string,
  outcome: TraceOutcome,
  site: string,
): void {
  const typeName = thrownTypeName(outcome);
  if (typeName === undefined || !isIdentifier(typeName)) return;
  into.observe(context, exceptionCandidate(typeName), site, typeName);
}

/** Records raw template text verbatim — normalizing it would destroy its placeholders. */
function observeTemplate(
  into: Collector,
  context: string,
  template: string | undefined,
  site: string,
): void {
  if (template === undefined || template.trim() === "") return;
  into.observe(context, { phrase: template, kind: "template" }, site, template);
}

function observeTemplates(into: Collector, signature: MethodSignature, context: string): void {
  const site = `${signature.className}.${signature.methodName}`;
  observeTemplate(into, context, signature.narration, site);
  observeTemplate(into, context, signature.errorContext, site);
}

function observeNode(
  into: Collector,
  node: TraceNode,
  context: string,
  includeTemplates: boolean,
): void {
  const { className, methodName } = node.signature;
  const site = `${className}.${methodName}`;
  observeClass(into, context, className);
  observeMethod(into, context, methodName, site);
  observeParameters(into, context, node.signature, site);
  observeException(into, context, node.outcome, site);
  if (includeTemplates) observeTemplates(into, node.signature, context);
}

/** Canonical harvest order: context, phrase, kind as declared, then site and identifier. */
function compareObservations(left: Observation, right: Observation): number {
  return (
    compareText(left.context, right.context) ||
    compareText(left.phrase, right.phrase) ||
    TERM_KINDS.indexOf(left.kind) - TERM_KINDS.indexOf(right.kind) ||
    compareText(left.site, right.site) ||
    compareText(left.identifier, right.identifier)
  );
}

/**
 * Harvests glossary candidates from captured trace trees.
 *
 * INTENT: the bridge from what a test run observed to what the vocabulary should contain. v1
 * sources are method names (verb phrase plus object noun phrase), parameter names, class names
 * with the role suffix dropped, and the type names of thrown errors. Observations are aggregated
 * and deterministically ordered; the harvester makes no merge decisions and reads nothing from the
 * glossary except its declared contexts.
 *
 * @param model the glossary whose declared contexts scope the observations.
 * @param trees the trace trees of one run.
 * @param sourcePathOf resolves a node's class name to the source path its context is declared by.
 * @returns aggregated observations ordered by `(context, phrase, kind, site, identifier)`; empty
 * for an empty forest. Names that are not identifiers — synthetic nodes like `<launcher>` — are
 * skipped, because harvesting is best-effort by design.
 * @remarks Narration templates are deliberately not harvested here: in a real trace the narration
 * already has parameter values interpolated into it, so harvesting it would write runtime data
 * into a committed file. Template harvesting belongs to the static scan.
 * @remarks Ordering ends on `identifier`, one field beyond the Java runtime. Two identifiers can
 * normalize to the same phrase at the same site (a method and its parameter), and leaving that
 * pair unordered would let harvest output depend on traversal accidents.
 * @example
 * ```ts
 * harvestTraces(model, trees, (className) => sourcePaths.get(className));
 * ```
 */
export function harvestTraces(
  model: Glossary,
  trees: readonly TraceTree[],
  sourcePathOf: SourcePathLookup,
): readonly HarvestCandidate[] {
  return collect(model, trees, sourcePathOf, false);
}

/**
 * Harvests glossary candidates from trees built by scanning source, adding `template` candidates.
 *
 * INTENT: the static half of harvesting, and the only path allowed to harvest `@narrated` /
 * `@onError` text. A scanned signature carries the **raw** template with its placeholders intact,
 * which is what a per-locale template variant must key on; a captured trace carries the same
 * template with parameter values already interpolated, so harvesting that would write one run's
 * runtime data into a committed file.
 *
 * @param model the glossary whose declared contexts scope the observations.
 * @param trees synthetic trees built from scanned source.
 * @param sourcePathOf resolves a node's class name to the source path its context is declared by.
 * @returns aggregated observations in the same order {@link harvestTraces} produces, with the
 * templates among them. Template phrases are recorded verbatim — normalizing one would destroy the
 * placeholders that make it a template — so a blank template is skipped rather than recorded.
 * @example
 * ```ts
 * harvestStatic(model, scanSourceTrees(files), (className) => sourcePaths.get(className));
 * ```
 */
export function harvestStatic(
  model: Glossary,
  trees: readonly TraceTree[],
  sourcePathOf: SourcePathLookup,
): readonly HarvestCandidate[] {
  return collect(model, trees, sourcePathOf, true);
}

function collect(
  model: Glossary,
  trees: readonly TraceTree[],
  sourcePathOf: SourcePathLookup,
  includeTemplates: boolean,
): readonly HarvestCandidate[] {
  const observations = collector();
  const roots = trees.flatMap((tree) => tree.roots);
  walkPreOrder(
    roots,
    (n) => n.children,
    (node) => {
      const context = contextOfClass(model, sourcePathOf, node.signature.className);
      observeNode(observations, node, context, includeTemplates);
    },
  );
  return observations.drain();
}
