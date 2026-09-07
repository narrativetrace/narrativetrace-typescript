// SPDX-License-Identifier: BUSL-1.1
// Licensed under the Business Source License 1.1 (see LICENSE); Change Date: four years from publication; Change License: Apache-2.0
// Copyright (c) 2026 Empower Agile
/** One hostile scalar from `strings.json` or `injection.json`. */
export interface CorpusCase {
  /** Stable kebab-case identifier, quoted by a failing assertion so the case is findable. */
  readonly id: string;
  /** What breaks, not what the bytes are. */
  readonly description: string;
  /** The materialized value, `repeat` already expanded. */
  readonly value: string;
}

/** One wire-header value from `headers.json`. */
export interface HeaderCase {
  readonly id: string;
  readonly description: string;
  readonly value: string;
  /** Whether a conforming parser must accept it; every other case must be refused without throwing. */
  readonly accepted: boolean;
}

/** One template string from `templates.json`. */
export interface TemplateCase {
  readonly id: string;
  readonly description: string;
  readonly template: string;
  /**
   * Names the fixture it resolves against (`card`, `user`, `order`, `deep`, `unicode`, `wide`,
   * `chain`, or the scalar fixtures `password-scalar`, `jwt-scalar`, `newline-scalar`).
   */
  readonly values: string;
  /** `"redacted"` when the result must carry the redaction marker; `undefined` otherwise. */
  readonly expect?: string;
}

/** Whether a template case pins the redaction invariant rather than only the universal oracles. */
export function expectsRedaction(templateCase: TemplateCase): boolean {
  return templateCase.expect === "redacted";
}

/**
 * One row of `redaction.json`: a sensitive field name, or a sensitive value shape.
 *
 * A row names either a field (`name` plus the `canary` planted behind it) or a value (`value`,
 * which is its own canary because the shape *is* the secret), never both or neither; `expect`
 * says which way the assertion runs — `"redacted"` cases must reach no output byte, `"visible"`
 * cases must survive (the false-positive half is the half that keeps the default switched on).
 */
export interface RedactionCase {
  readonly id: string;
  readonly description: string;
  /** The field name under test, for a name case; `undefined` for a value case. */
  readonly name?: string;
  /** The value under test, for a value case; `undefined` for a name case. */
  readonly value?: string;
  /** The token planted behind `name`, which the oracle looks for; name cases only. */
  readonly canary?: string;
  /** `"redacted"` or `"visible"`. */
  readonly expect: string;
}

/** Whether this row names a field rather than carrying a bare value. */
export function isNameCase(redactionCase: RedactionCase): boolean {
  return redactionCase.name !== undefined;
}

/** The string the oracle looks for: the canary for a name case, the value itself otherwise. */
export function secretOf(redactionCase: RedactionCase): string {
  return (isNameCase(redactionCase) ? redactionCase.canary : redactionCase.value) ?? "";
}

/** One declarative object-graph shape from `graphs.json`. See the corpus README for the table. */
export interface GraphCase {
  readonly id: string;
  readonly description: string;
  /** Shape name, or `undefined` when `layers` applies. */
  readonly kind?: string;
  /** Wrapper kinds, innermost first. */
  readonly layers: readonly string[];
  /** The wrapper repeated by `repeatLayer`. */
  readonly layer?: string;
  /** The container used by `width` and `selfInCollection`. */
  readonly container?: string;
  /** The misbehaving member used by `hostileMember`. */
  readonly member?: string;
  /** The `future`/`throwable` variant. */
  readonly state?: string;
  /** `"secret-record"` when the builder must plant a sentinel-bearing record. */
  readonly payload?: string;
  /** The shape's size: depth, width, ring length or field count. */
  readonly n: number;
}

/** Whether this shape carries a redacted sentinel the redaction oracle can look for. */
export function carriesSecret(graphCase: GraphCase): boolean {
  return graphCase.payload === "secret-record";
}

/**
 * One declarative `TraceNode` call-tree shape from `trace-shapes.json`: a chain (a legitimate deep
 * recursive method) or a cycle (a hand-built/replayed tree with an undefended ancestor). See the
 * corpus README.
 */
export interface TraceShapeCase {
  readonly id: string;
  readonly description: string;
  /** `"chain"` or `"cycle"`. */
  readonly kind: string;
  /** Chain length, or ring length (`1` is a node holding itself). */
  readonly n: number;
}
