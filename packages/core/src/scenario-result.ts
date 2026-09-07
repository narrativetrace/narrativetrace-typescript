// SPDX-License-Identifier: BUSL-1.1
// Licensed under the Business Source License 1.1 (see LICENSE); Change Date: four years from publication; Change License: Apache-2.0
// Copyright (c) 2026 Empower Agile
/**
 * How one traced scenario ended.
 *
 * INTENT: the words `success`, `error`, `PASSED` and `FAILED` were inline string literals spread
 * across the exporters, which is how a wire format drifts from the schema that declares it. One
 * type owns both spellings and the mapping between them, so a rename becomes a compiler error
 * rather than an artifact nobody validates.
 *
 * @remarks The union members *are* the schema-legal wire spellings, so no accessor is needed to
 * get one; {@link scenarioDisplayName} supplies the human-facing form.
 *
 * Distinct from `TraceOutcome`, which is how a single *call* ended
 * (`returned`/`threw`/`incomplete`), and from the OTel-facing `nt.outcome` vocabulary on canonical
 * entries and chapters. Three vocabularies, three audiences — see `schema/README.md`.
 */
export type ScenarioResult = "success" | "error";

/** The human-facing spelling, for Markdown and console captions. */
export function scenarioDisplayName(result: ScenarioResult): "PASSED" | "FAILED" {
  return result === "success" ? "PASSED" : "FAILED";
}

/**
 * The result of a scenario, from whether anything in it failed.
 *
 * @param failed whether any node of the trace threw.
 */
export function scenarioResult(failed: boolean): ScenarioResult {
  return failed ? "error" : "success";
}
