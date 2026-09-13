// SPDX-License-Identifier: BUSL-1.1
// Licensed under the Business Source License 1.1 (see LICENSE); Change Date: four years from publication; Change License: Apache-2.0
// Copyright (c) 2026 Empower Agile
import { structuralDelta } from "./structural-delta.js";

/** How a scenario's structure relates to its last-green artifact. */
export type ScenarioDeltaKind = "new" | "unchanged" | "changed";

/**
 * One scenario's structural status against its last-green `.nt` artifact.
 *
 * INTENT: the unit the trace writer reports upward after each test — the suite footer aggregates
 * these into the post-run delta line, and the failure surface prints the diff of the failing
 * scenario. Produced beside the artifact write so baseline reading happens exactly once. Port of
 * Java `output.ScenarioDelta`.
 */
export interface ScenarioDelta {
  /** The humanized scenario name (the `scenario:` header value). */
  readonly scenario: string;
  /** `"new"` (no baseline yet), `"unchanged"` (byte-identical), or `"changed"`. */
  readonly kind: ScenarioDeltaKind;
  /** Compact change summary (`+4 calls X.y`); empty unless `"changed"`. */
  readonly summary: string;
  /** Readable line diff against the baseline; empty unless `"changed"`. */
  readonly diff: string;
}

/**
 * Classifies the current artifact against the baseline; an absent baseline means no last-green
 * artifact exists yet — the scenario is `"new"`.
 */
export function scenarioDelta(
  scenario: string,
  baseline: string | undefined,
  current: string,
): ScenarioDelta {
  if (baseline === undefined) {
    return { scenario, kind: "new", summary: "", diff: "" };
  }
  const delta = structuralDelta(baseline, current);
  if (delta.unchanged) {
    return { scenario, kind: "unchanged", summary: "", diff: "" };
  }
  return { scenario, kind: "changed", summary: delta.summary, diff: delta.diff };
}
