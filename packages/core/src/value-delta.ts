// SPDX-License-Identifier: BUSL-1.1
// Licensed under the Business Source License 1.1 (see LICENSE); Change Date: four years from publication; Change License: Apache-2.0
// Copyright (c) 2026 Empower Agile
import { ControlEscape } from "./control-escape.js";
import type { RenderedValue } from "./rendered-value.js";

/** Longest string value shown on either side of a field change before it is elided. */
const MAX_SCALAR_LENGTH = 60;

type ObjectValue = Extract<RenderedValue, { kind: "object" }>;

function cap(text: string): string {
  return text.length > MAX_SCALAR_LENGTH ? `${text.slice(0, MAX_SCALAR_LENGTH)}…` : text;
}

/**
 * Formats a scalar leaf the way the flat renderer prints it — a string quoted and control-escaped,
 * numbers and booleans bare, `other` (null, undefined, bigint, redacted, circular) as its captured
 * text — or `undefined` for a structured leaf, which has no unambiguous one-line form.
 */
function scalar(value: RenderedValue): string | undefined {
  if (value.kind === "string") return `"${cap(ControlEscape.sanitize(value.value))}"`;
  if (value.kind === "number") return String(value.value);
  if (value.kind === "boolean") return String(value.value);
  if (value.kind === "other") return cap(ControlEscape.sanitize(value.text));
  return undefined;
}

function scalarChange(before: RenderedValue, after: RenderedValue): string | undefined {
  const from = scalar(before);
  const to = scalar(after);
  return from === undefined || to === undefined ? undefined : `${from}→${to}`;
}

function sameFieldNames(a: ObjectValue, b: ObjectValue): boolean {
  const keysA = Object.keys(a.fields);
  const keysB = Object.keys(b.fields);
  return keysA.length === keysB.length && keysA.every((key) => key in b.fields);
}

function sameList(
  a: Extract<RenderedValue, { kind: "list" }>,
  b: Extract<RenderedValue, { kind: "list" }>,
): boolean {
  return (
    a.items.length === b.items.length &&
    a.items.every((item, i) => sameValue(item, b.items[i] as RenderedValue))
  );
}

function sameObject(a: ObjectValue, b: ObjectValue): boolean {
  return (
    a.typeName === b.typeName &&
    sameFieldNames(a, b) &&
    Object.keys(a.fields).every((key) =>
      sameValue(a.fields[key] as RenderedValue, b.fields[key] as RenderedValue),
    )
  );
}

/**
 * Structural equality for two structured values — plain object literals have no value equality in
 * JS, so two captures holding identical content are different references and every field of a
 * re-captured object would otherwise read as changed.
 */
function sameValue(a: RenderedValue, b: RenderedValue): boolean {
  if (a.kind === "object" && b.kind === "object") return sameObject(a, b);
  if (a.kind === "list" && b.kind === "list") return sameList(a, b);
  return scalar(a) === scalar(b) && a.kind === b.kind;
}

/** The `field: before→after` parts, or `undefined` as soon as one changed field is structured. */
function changedFields(from: ObjectValue, to: ObjectValue): string[] | undefined {
  const parts: string[] = [];
  for (const key of Object.keys(from.fields)) {
    const before = from.fields[key] as RenderedValue;
    const after = to.fields[key] as RenderedValue;
    if (sameValue(before, after)) continue;
    const change = scalarChange(before, after);
    if (change === undefined) return undefined;
    parts.push(`${key}: ${change}`);
  }
  return parts;
}

/**
 * Composes the delta of `changed` against `reference`, or `undefined` when the pair cannot be
 * expressed as a scalar field diff — a different type, a different field set, no difference at all,
 * or a changed field that is itself structured.
 *
 * INTENT: when a captured value reappears inside one trace slightly changed — the multi-currency
 * case: a ledger returns an expense at 100 USD, the calculator receives it normalized to 92 EUR —
 * a second full render hides the one field that moved inside a ~300-character blob. This composes
 * the compact `{amount: 100→92, currency: "USD"→"EUR"}` that {@link ValueReferenceIndex} appends to
 * the reference label, so the change prints AS a diff.
 *
 * @remarks Computed from the two *structured* trees, formatting scalar leaves only. It never
 * reconstructs a flat render from a structured value: the flat and structured channels are captured
 * independently, and deriving one from the other is a divergence class the reference implementation
 * has already paid for twice.
 */
export function valueDelta(
  reference: RenderedValue | undefined,
  changed: RenderedValue | undefined,
): string | undefined {
  if (reference?.kind !== "object" || changed?.kind !== "object") return undefined;
  if (reference.typeName !== changed.typeName || !sameFieldNames(reference, changed)) {
    return undefined;
  }
  const parts = changedFields(reference, changed);
  return parts === undefined || parts.length === 0 ? undefined : `{${parts.join(", ")}}`;
}
