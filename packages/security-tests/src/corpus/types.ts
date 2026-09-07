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
   * Names the fixture graph it resolves against (`card`, `user`, `order`, `deep`, `unicode`,
   * `wide`, `chain`).
   */
  readonly values: string;
  /** `"redacted"` when the result must carry the redaction marker; `undefined` otherwise. */
  readonly expect?: string;
}

/** Whether a template case pins the redaction invariant rather than only the universal oracles. */
export function expectsRedaction(templateCase: TemplateCase): boolean {
  return templateCase.expect === "redacted";
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
