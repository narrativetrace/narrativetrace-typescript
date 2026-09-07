// SPDX-License-Identifier: BUSL-1.1
// Licensed under the Business Source License 1.1 (see LICENSE); Change Date: four years from publication; Change License: Apache-2.0
// Copyright (c) 2026 Empower Agile
import { ControlEscape } from "./control-escape.js";
import { RedactionPolicy } from "./redaction-policy.js";
import type { RenderedValue } from "./rendered-value.js";
import type { TraceNode } from "./trace-node.js";
import type { TraceTree } from "./trace-tree.js";
import { walkPreOrder } from "./tree-walk.js";
import { valueDelta } from "./value-delta.js";

/** Shortest rendered value that can earn a reference; below this a label costs more than it saves. */
const MIN_REF_LENGTH = 40;

/** Longest label text kept before it is elided with `…`. */
const MAX_LABEL_LENGTH = 24;

/** Field names, in priority order, whose string value names the entity (Java's identity ladder). */
const IDENTITY_FIELDS = ["name", "id", "description", "title", "key", "label", "code"] as const;

function isObject(
  value: RenderedValue | undefined,
): value is Extract<RenderedValue, { kind: "object" }> {
  return value?.kind === "object";
}

function isUsableLabelText(value: string): boolean {
  return value.trim().length > 0 && value !== RedactionPolicy.MARKER;
}

/** The first identity-signalling field carrying a usable plain string, as its name and text. */
function identityFieldOf(
  obj: Extract<RenderedValue, { kind: "object" }>,
): { name: string; value: string } | undefined {
  for (const name of IDENTITY_FIELDS) {
    const field = obj.fields[name];
    if (field?.kind === "string" && isUsableLabelText(field.value)) {
      return { name, value: field.value };
    }
  }
  return undefined;
}

function capLabel(text: string): string {
  return text.length > MAX_LABEL_LENGTH ? `${text.slice(0, MAX_LABEL_LENGTH)}…` : text;
}

/** Label stem for a value: its identity field, else its type name, else nothing. */
function baseLabel(structured: RenderedValue | undefined): string | undefined {
  if (!isObject(structured)) return undefined;
  const identity = identityFieldOf(structured);
  return identity ? capLabel(ControlEscape.sanitize(identity.value)) : structured.typeName;
}

/**
 * Stable key for "the same entity": the structured type name plus the uncapped value of the
 * identity field that named it. Two captures sharing this key are the same thing at two moments,
 * which is what makes a delta between them meaningful. `undefined` when the value carries no
 * identity field — a type name alone would group unrelated instances of the same class, and a diff
 * between two different expenses is noise, not signal.
 */
function identityKey(structured: RenderedValue | undefined): string | undefined {
  if (!isObject(structured)) return undefined;
  const identity = identityFieldOf(structured);
  return identity ? `${structured.typeName} ${identity.name} ${identity.value}` : undefined;
}

/** Whether any two of one identity's rendered forms differ by scalar fields alone. */
function anyPairDiffs(forms: readonly RenderedValue[]): boolean {
  return forms.some((one) => forms.some((other) => valueDelta(one, other) !== undefined));
}

function groupFormsByIdentity(
  structuredByContent: ReadonlyMap<string, RenderedValue>,
): Map<string, string[]> {
  const formsByKey = new Map<string, string[]>();
  for (const [rendered, value] of structuredByContent) {
    const key = identityKey(value);
    if (key === undefined) continue;
    const forms = formsByKey.get(key) ?? [];
    forms.push(rendered);
    formsByKey.set(key, forms);
  }
  return formsByKey;
}

/**
 * Maps each candidate value to its identity key when that key covers more than one rendered form —
 * the same entity, captured again with something changed — *and* at least one of those forms can
 * actually be expressed as a delta of another. The second condition is what keeps the fallback
 * silent: a pair whose difference is structural renders exactly as it did before this feature
 * existed, with no reference label stamped on a definition nothing ever refers back to.
 */
function deltaKeys(structuredByContent: ReadonlyMap<string, RenderedValue>): Map<string, string> {
  const keyByContent = new Map<string, string>();
  for (const [key, forms] of groupFormsByIdentity(structuredByContent)) {
    const values = forms.map((f) => structuredByContent.get(f) as RenderedValue);
    if (anyPairDiffs(values)) {
      for (const rendered of forms) keyByContent.set(rendered, key);
    }
  }
  return keyByContent;
}

function occurrencesIn(container: string, value: string): number {
  let occurrences = 0;
  let idx = container.indexOf(value);
  while (idx >= 0) {
    occurrences++;
    idx = container.indexOf(value, idx + value.length);
  }
  return occurrences;
}

/** Emissions of `value` nested inside other captured values, weighted by their own counts. */
function containmentCount(value: string, counts: Map<string, number>): number {
  let total = 0;
  for (const [container, count] of counts) {
    if (container !== value) total += occurrencesIn(container, value) * count;
  }
  return total;
}

function countValue(
  rendered: string | null | undefined,
  structured: RenderedValue | undefined,
  counts: Map<string, number>,
  structuredByContent: Map<string, RenderedValue>,
): void {
  if (!rendered || rendered.length < MIN_REF_LENGTH) return;
  counts.set(rendered, (counts.get(rendered) ?? 0) + 1);
  if (structured && !structuredByContent.has(rendered)) {
    structuredByContent.set(rendered, structured);
  }
}

function countOneNode(
  node: TraceNode,
  counts: Map<string, number>,
  structuredByContent: Map<string, RenderedValue>,
): void {
  for (const param of node.signature.parameters) {
    if (!param.redacted) {
      countValue(param.renderedValue, param.structured, counts, structuredByContent);
    }
  }
  if (node.outcome.kind === "returned") {
    countValue(node.outcome.renderedValue, node.outcome.structured, counts, structuredByContent);
  }
}

// Bounded, cycle-safe (walkPreOrder) — a hand-built or deserialized tree can hold an ancestor.
function countNodes(
  roots: readonly TraceNode[],
  counts: Map<string, number>,
  structuredByContent: Map<string, RenderedValue>,
): void {
  walkPreOrder(
    roots,
    (n) => n.children,
    (node) => countOneNode(node, counts, structuredByContent),
  );
}

/**
 * Content-addressed deduplication of captured values for one rendering pass.
 *
 * INTENT: a value whose rendered form repeats across a trace carries information only where it
 * differs; byte-identical repetition is noise that hides the render that changed. This index
 * collects the rendered parameter and return values of a {@link TraceTree}, decides which of them
 * earn a reference (long enough and emitted more than once), and hands renderers a display form:
 * the first emission defines `‹label›=full`, later emissions are just `‹label›`. Equality is byte
 * equality of the rendered string.
 *
 * A value that differs is not simply re-rendered in full, though. When two rendered forms belong to
 * the same *entity* — same structured type name, same value in the identity field that names the
 * label — the later one renders as `‹label›′{amount: 100→92}`, a diff against the reference this
 * document already defines. That keeps the artifact self-contained and makes the one field that
 * moved the thing the reader sees. Anything the diff cannot express falls back to the full render.
 *
 * @remarks One instance serves exactly one rendering pass: label definition order follows emission
 * order, so the instance is stateful and must not be shared across renders.
 */
export class ValueReferenceIndex {
  readonly #referenced: ReadonlySet<string>;
  readonly #referencedByLengthDesc: readonly string[];
  readonly #structuredByContent: ReadonlyMap<string, RenderedValue>;
  readonly #deltaKeyByContent: ReadonlyMap<string, string>;
  readonly #groupAnchors = new Map<string, string>();
  readonly #definedLabels = new Map<string, string>();
  readonly #baseLabelUses = new Map<string, number>();
  #genericCounter = 0;

  private constructor(
    referenced: ReadonlySet<string>,
    structuredByContent: ReadonlyMap<string, RenderedValue>,
  ) {
    this.#referenced = referenced;
    this.#referencedByLengthDesc = [...referenced].sort(
      (a, b) => b.length - a.length || (a < b ? -1 : a > b ? 1 : 0),
    );
    this.#structuredByContent = structuredByContent;
    this.#deltaKeyByContent = deltaKeys(structuredByContent);
  }

  /** Collects candidate values from the tree; values emitted at least twice earn a reference. */
  static build(tree: TraceTree): ValueReferenceIndex {
    const counts = new Map<string, number>();
    const structuredByContent = new Map<string, RenderedValue>();
    countNodes(tree.roots, counts, structuredByContent);

    const referenced = new Set<string>();
    for (const [value, count] of counts) {
      if (count + containmentCount(value, counts) >= 2) referenced.add(value);
    }
    return new ValueReferenceIndex(referenced, structuredByContent);
  }

  /**
   * The emission form of a rendered value: the full text for unreferenced values, `‹label›=full`
   * the first time a referenced value is emitted, `‹label›` afterwards.
   */
  display(rendered: string): string {
    if (this.#referenced.has(rendered)) return this.#referenceDisplay(rendered);
    return this.#deltaDisplay(rendered) ?? this.#replaceContained(rendered);
  }

  /**
   * Defines or reuses the label of a byte-repeated value. A repeated value that is itself a changed
   * re-capture of an already-defined reference is defined AS the delta (`‹label·2›=‹label›′{…}`)
   * rather than as a second full blob — it repeats, so it earns its own label, but the change is
   * still what the reader sees.
   */
  #referenceDisplay(value: string): string {
    const existing = this.#definedLabels.get(value);
    if (existing !== undefined) return existing;
    const created = this.#newLabel(value);
    this.#definedLabels.set(value, created);
    const asDelta = this.#deltaAgainstAnchor(value);
    this.#rememberAnchor(value);
    return `${created}=${asDelta ?? this.#replaceContained(value)}`;
  }

  /**
   * Emission form for a value whose identity was seen in more than one rendered form: the first
   * such form emitted becomes the in-document reference, and every later, differing form renders as
   * a diff against it. `undefined` leaves the caller on the full-render path.
   */
  #deltaDisplay(rendered: string): string | undefined {
    const key = this.#deltaKeyByContent.get(rendered);
    if (key === undefined) return undefined;
    if (this.#groupAnchors.has(key)) return this.#deltaAgainstAnchor(rendered);
    const label = this.#newLabel(rendered);
    this.#definedLabels.set(rendered, label);
    this.#groupAnchors.set(key, rendered);
    return `${label}=${this.#replaceContained(rendered)}`;
  }

  /** Records a newly-labelled value as its identity's reference, if it belongs to a delta pair. */
  #rememberAnchor(rendered: string): void {
    const key = this.#deltaKeyByContent.get(rendered);
    if (key !== undefined && !this.#groupAnchors.has(key)) this.#groupAnchors.set(key, rendered);
  }

  /**
   * The `‹anchor›′{field: before→after}` form of a value whose identity already has a reference
   * defined in this document, or `undefined` when there is no such anchor yet or the difference is
   * not a scalar field diff.
   */
  #deltaAgainstAnchor(rendered: string): string | undefined {
    const key = this.#deltaKeyByContent.get(rendered);
    const anchor = key === undefined ? undefined : this.#groupAnchors.get(key);
    if (anchor === undefined) return undefined;
    const delta = valueDelta(
      this.#structuredByContent.get(anchor),
      this.#structuredByContent.get(rendered),
    );
    return delta === undefined ? undefined : `${this.#definedLabels.get(anchor)}′${delta}`;
  }

  /**
   * Replaces every occurrence of a referenced value inside `rendered` with its reference, defining
   * it inline on first emission. Longest values are replaced first so a value nested inside another
   * referenced value resolves inside that definition.
   */
  #replaceContained(rendered: string): string {
    let result = rendered;
    for (const value of this.#referencedByLengthDesc) {
      if (value !== rendered) result = this.#replaceOccurrences(result, value);
    }
    return result;
  }

  #replaceOccurrences(text: string, value: string): string {
    let idx = text.indexOf(value);
    if (idx < 0) return text;
    let out = "";
    let from = 0;
    while (idx >= 0) {
      out += text.slice(from, idx) + this.#referenceDisplay(value);
      from = idx + value.length;
      idx = text.indexOf(value, from);
    }
    return out + text.slice(from);
  }

  #newLabel(rendered: string): string {
    const base = baseLabel(this.#structuredByContent.get(rendered));
    if (base === undefined) return `‹v${++this.#genericCounter}›`;
    const uses = (this.#baseLabelUses.get(base) ?? 0) + 1;
    this.#baseLabelUses.set(base, uses);
    return uses === 1 ? `‹${base}›` : `‹${base}·${uses}›`;
  }
}
