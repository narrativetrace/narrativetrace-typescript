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
 *
 * @llmNote ADV-2026-09-14-1: a value case's `position` defaults to a bare top-level scalar. Every
 * name case already places its canary behind a field name in a one-entry `Map` (see
 * {@link payloadOf}), so without this field the corpus could only ever put a value-shaped secret
 * where the renderer's value-shape axis was already known to look — never in a `Map` KEY position,
 * which is exactly where `renderMapKey` was found to skip that axis. `"mapKey"` places `value` as
 * the key of a one-entry map instead.
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
  /**
   * `"mapKey"` to place a value case's `value` as a map key rather than rendering it bare;
   * `undefined` (the default) for every other row.
   */
  readonly position?: string;
}

const MAP_KEY_POSITION = "mapKey";

/** The ordinary, visible value paired with a map-key case's secret key — it must survive. */
export const MAP_KEY_COMPANION_VALUE = "visible-value";

/** Whether this row names a field rather than carrying a bare value. */
export function isNameCase(redactionCase: RedactionCase): boolean {
  return redactionCase.name !== undefined;
}

/** Whether a value case places `value` as a map key rather than rendering it bare. */
export function isMapKeyCase(redactionCase: RedactionCase): boolean {
  return redactionCase.position === MAP_KEY_POSITION;
}

/** The string the oracle looks for: the canary for a name case, the value itself otherwise. */
export function secretOf(redactionCase: RedactionCase): string {
  return (isNameCase(redactionCase) ? redactionCase.canary : redactionCase.value) ?? "";
}

/**
 * The object to hand the capture path: the value alone, the value as a map key, or a one-entry map
 * under the sensitive field name — mirrors the Java golden source's `RedactionCase.payload()`.
 *
 * @llmNote A `Map` is the vehicle for name cases because these names are data — including two
 * spellings of the same Spanish word that differ only by Unicode normalization form. A value case
 * opts into the same vehicle, as the KEY rather than the value, via {@link isMapKeyCase}. The
 * capture-path suites drive name cases through a real parameter NAME instead (that is the seam
 * the 2026-09 audit found untested), so only the map-key branch changes what they feed the proxy.
 */
export function payloadOf(redactionCase: RedactionCase): unknown {
  if (isNameCase(redactionCase)) {
    return new Map([[redactionCase.name as string, redactionCase.canary]]);
  }
  return isMapKeyCase(redactionCase)
    ? new Map([[redactionCase.value as string, MAP_KEY_COMPANION_VALUE]])
    : redactionCase.value;
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
