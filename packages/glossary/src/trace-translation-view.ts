// SPDX-License-Identifier: BUSL-1.1
// Licensed under the Business Source License 1.1 (see LICENSE); Change Date: four years from publication; Change License: Apache-2.0
// Copyright (c) 2026 Empower Agile
import {
  MarkdownEscape,
  TREE_WALK_MARKER,
  type TreeWalkStop,
  walkPreOrder,
} from "@narrativetrace/core";
import { contextOfClass, type SourcePathLookup } from "./context-resolver.js";
import type { Glossary } from "./glossary.js";
import { type GlossaryTranslator, glossaryTranslator } from "./glossary-translator.js";
import { type ScaffoldingBundle, scaffoldingBundle } from "./scaffolding-bundle.js";
import { termKey } from "./term-key.js";
import {
  classCandidate,
  exceptionCandidate,
  normalizePhrase,
  parameterCandidate,
} from "./term-normalizer.js";
import { compareText } from "./text-order.js";
import type { TranslatableCall, TranslatableTrace } from "./trace-export-reader.js";

/** One run of the translated view: what to translate, with what vocabulary, into which locale. */
export interface TraceTranslationRequest {
  /** The stored trace, as {@link readTraceExport} returns it. */
  readonly trace: TranslatableTrace;
  /** Glossary supplying both the bounded contexts and the translations. */
  readonly model: Glossary;
  /** Target locale tag, matched exactly against curated translation keys. */
  readonly locale: string;
  /** Resolves a class name to the source path its bounded context is declared by. */
  readonly sourcePathOf: SourcePathLookup;
}

/**
 * One phrase the translated view could not say in the target locale.
 *
 * INTENT: the gap list is the work queue that drives glossary completion — it names exactly where
 * curation effort would pay off, in the context the term belongs to.
 */
export interface TranslationGap {
  /** Bounded context the phrase was observed in. */
  readonly context: string;
  /** The normalized phrase that has no translation for this locale. */
  readonly phrase: string;
}

/** The translated view of one trace. */
export interface TranslatedTrace {
  /** The whole translated document: scenario line, call flow, and the gaps footer when non-empty. */
  readonly markdown: string;
  /** Every phrase that fell through untranslated, deduplicated, in `(context, phrase)` order. */
  readonly gaps: readonly TranslationGap[];
}

/** Everything the per-call rendering needs, assembled once per run. */
interface Rendering {
  readonly translator: GlossaryTranslator;
  readonly model: Glossary;
  readonly sourcePathOf: SourcePathLookup;
  readonly words: ScaffoldingBundle;
  /** Gaps found so far, keyed for deduplication: one phrase names one work item, not one per use. */
  readonly gaps: Map<string, TranslationGap>;
}

/**
 * The translation of one phrase, or `undefined` when the glossary has none for this locale — which
 * also records the gap, since every lookup that misses is a curation opportunity.
 */
function translate(rendering: Rendering, context: string, phrase: string): string | undefined {
  const translation = rendering.translator.translate(context, phrase);
  if (translation.translated) return translation.text;
  rendering.gaps.set(termKey(context, phrase), { context, phrase });
  return undefined;
}

/**
 * Renders one identifier as its gloss with the original beside it, or verbatim when the glossary
 * has nothing to say about it.
 */
function glossed(
  rendering: Rendering,
  context: string,
  identifier: string,
  phrase: string | undefined,
): string {
  const translation = phrase === undefined ? undefined : translate(rendering, context, phrase);
  return translation === undefined ? identifier : `${translation} [${identifier}]`;
}

/**
 * Renders the parameter list: names translated, values carried through untouched.
 *
 * @remarks A parameter name is glossed *without* its original beside it, unlike the call's own
 * identifiers. The name is re-derivable from the untouched canonical file, and glossing every
 * parameter would double the length of the one line a support reader scans.
 */
function renderParameters(rendering: Rendering, context: string, call: TranslatableCall): string {
  return call.parameters
    .map((parameter) => {
      const phrase = parameterCandidate(parameter.name)?.phrase;
      const translation = phrase === undefined ? undefined : translate(rendering, context, phrase);
      return `${translation ?? parameter.name}: ${parameter.value}`;
    })
    .join(", ");
}

/** A thrown error, glossed like any other identifier; its message is a runtime value, so verbatim. */
function renderError(rendering: Rendering, context: string, call: TranslatableCall): string {
  const type =
    call.errorType === undefined
      ? undefined
      : glossed(rendering, context, call.errorType, exceptionCandidate(call.errorType)?.phrase);
  const named = type === undefined ? "" : `${type}: `;
  return ` ❌ ${named}${MarkdownEscape.text(call.errorMessage ?? "")}`;
}

/** Nothing at all for a call that returned no value — the English renderers are silent there too. */
function renderOutcome(rendering: Rendering, context: string, call: TranslatableCall): string {
  if (call.outcome === "threw") return renderError(rendering, context, call);
  if (call.outcome === "incomplete") return ` ⏳ (${rendering.words.incomplete})`;
  const value = call.returnValue;
  return value === null || value === undefined || value === "undefined" ? "" : ` → \`${value}\``;
}

// The node's own line prints regardless of the guard ("contributes itself"); a stopped call gets
// a marker line in place of its children.
function pushCallLine(
  rendering: Rendering,
  call: TranslatableCall,
  depth: number,
  stop: TreeWalkStop | undefined,
  lines: string[],
): void {
  const context = contextOfClass(rendering.model, rendering.sourcePathOf, call.className);
  const owner = glossed(rendering, context, call.className, classCandidate(call.className)?.phrase);
  const method = glossed(rendering, context, call.methodName, normalizePhrase(call.methodName));
  const head = `${owner}.${method}(${renderParameters(rendering, context, call)})`;
  lines.push(
    `${"  ".repeat(depth)}- ${MarkdownEscape.code(head)}${renderOutcome(rendering, context, call)}`,
  );
  if (stop !== undefined) lines.push(`${"  ".repeat(depth + 1)}- ${TREE_WALK_MARKER[stop]}`);
}

// Explicit-stack (non-recursive) pre-order walk, bounded and cycle-safe via TreeWalk (through
// walkPreOrder) — depth is threaded through a side-channel map seeded via the childrenOf callback,
// the same technique clarity-analyzer.ts uses, since walkPreOrder only reports the node itself.
function renderCalls(
  rendering: Rendering,
  roots: readonly TranslatableCall[],
  lines: string[],
): void {
  const depthOf = new Map<TranslatableCall, number>();
  const childrenOf = (call: TranslatableCall): readonly TranslatableCall[] => {
    const depth = depthOf.get(call) ?? 0;
    for (const child of call.children) depthOf.set(child, depth + 1);
    return call.children;
  };
  walkPreOrder(roots, childrenOf, (call, stop) => {
    pushCallLine(rendering, call, depthOf.get(call) ?? 0, stop, lines);
  });
}

/** Gap order is the glossary file's own: context first, then phrase — the order a curator reads in. */
function orderedGaps(gaps: Map<string, TranslationGap>): TranslationGap[] {
  return [...gaps.values()].sort(
    (left, right) =>
      compareText(left.context, right.context) || compareText(left.phrase, right.phrase),
  );
}

function gapsSection(words: ScaffoldingBundle, gaps: readonly TranslationGap[]): string[] {
  if (gaps.length === 0) return [];
  return [
    `## ${words.glossaryGaps}`,
    "",
    ...gaps.map((gap) => `- ${gap.context}: ${MarkdownEscape.code(gap.phrase)}`),
    "",
  ];
}

/** The whole file: scenario line, call flow, and the gaps footer when the run left any. */
function document(
  words: ScaffoldingBundle,
  scenario: string,
  flow: readonly string[],
  gaps: readonly TranslationGap[],
): string {
  return [
    `**${words.scenario}:** ${MarkdownEscape.text(scenario)}`,
    "",
    `## ${words.callFlow}`,
    "",
    ...flow,
    "",
    ...gapsSection(words, gaps),
  ].join("\n");
}

/**
 * Renders a stored trace as a translated Markdown view.
 *
 * INTENT: the support-engineer artifact of the plan's Phase 6 — the same story a trace already
 * tells, told in the reader's language. Every line is re-derived from structural fields rather than
 * substituted into rendered text, so no captured value can be altered by translation.
 *
 * @param request the trace, the vocabulary, the locale and the context lookup; see
 * {@link TraceTranslationRequest}.
 * @returns the translated view; see {@link TranslatedTrace}.
 * @remarks An identifier the glossary cannot translate renders verbatim — a translated view is a
 * gisting aid, so a missing term degrades one word rather than failing the file.
 */
export function renderTranslatedTrace(request: TraceTranslationRequest): TranslatedTrace {
  const rendering: Rendering = {
    translator: glossaryTranslator(request.model, request.locale),
    model: request.model,
    sourcePathOf: request.sourcePathOf,
    words: scaffoldingBundle(request.locale),
    gaps: new Map(),
  };
  const flow: string[] = [];
  renderCalls(rendering, request.trace.calls, flow);
  const gaps = orderedGaps(rendering.gaps);
  return Object.freeze({
    markdown: document(rendering.words, request.trace.scenario, flow, gaps),
    gaps: Object.freeze(gaps),
  });
}
