// SPDX-License-Identifier: BUSL-1.1
// Licensed under the Business Source License 1.1 (see LICENSE); Change Date: four years from publication; Change License: Apache-2.0
// Copyright (c) 2026 Empower Agile
import { VALUE_FREE_RULES, type ValueFreeRule } from "./value-free-rule.js";

/**
 * The hard gate: every value-free rule over every field of a report, before anything is built that
 * a user could file.
 *
 * INTENT: with no private inbox, a filed report is public from the first second — so the check runs
 * BEFORE the draft, the URL and the body file exist, and the verb refuses to produce any of them
 * while a violation stands. A gate that ran afterwards would be a warning, and a warning on this
 * path is a leak with a note attached.
 *
 * @llmNote Every rule is reported, not the first: a report that leaks two different shapes should
 * be fixed once, not twice. Order is field order then rule-declaration order, so the same report
 * always refuses in the same words — which is what lets a test assert on them.
 *
 * @llmNote Which rules apply is a property of the FIELD, not of the report: see
 * {@link DOCTOR_REPORT_FIELD} for the one exemption and why it exists. {@link rulesRefusing} is the
 * text-scoped reading with no field to exempt, and it is what the shared
 * `hostile-corpus/feedback.json` replay uses — so a corpus row's verdict never depends on which
 * field a value happened to arrive in.
 */

/**
 * The field whose text is the doctor's OWN generated JSON, and the one field `vf.marker` cannot
 * read.
 *
 * The doctor's check vocabulary NAMES the redaction marker: `trap.redaction-proof` IS the check
 * "no test asserts the literal `[REDACTED]`", and its message, its fix and its pass message all
 * quote that literal — whether the check passes or fails. So one rule, read against this one field,
 * refuses every report from every project that has NarrativeTrace installed at all, and the verb
 * can draft nothing. Found in the Java reference by running the verb against a real project rather
 * than against a hand-written stand-in for one; `cli-feedback.test.ts` runs this port's verb
 * against a real project for the same reason.
 *
 * @llmNote Named by a string because that is what a field map is keyed by, so this constant and
 * `reportFields()` have to agree: a renamed field silently re-arms the rule.
 * `value-free-check.test.ts` asserts the report carries exactly this key.
 */
export const DOCTOR_REPORT_FIELD = "doctor report";

/**
 * One refusal: the report field that carried the offending text, and the rule that refused it.
 *
 * INTENT: a refusal has to be actionable. "This report cannot be filed" sends a person looking
 * through every field; "`happened` breaks `vf.rendered-call`" sends them to one line.
 */
export interface ValueFreeViolation {
  /** The report field's own name, as the draft prints it. */
  readonly field: string;
  readonly rule: ValueFreeRule;
}

/** The one line a refusal prints: the field, the rule id, and what to do about it. */
export function describeViolation(violation: ValueFreeViolation): string {
  return `${violation.field}: ${violation.rule.id} — ${violation.rule.reason}`;
}

/**
 * Which rules read `fieldName`.
 *
 * Every rule reads every field except this one pair, and the exemption is deliberately as narrow as
 * it can be: the doctor's report is still read by the other nine, so an email, a home path, a
 * credential shape or a rendered call line inside a doctor message is refused exactly as it would
 * be anywhere else. What is exempt is one rule whose whole premise — "the marker only appears where
 * a value was blanked" — is false for OUR OWN generated text about that marker.
 */
function rulesFor(fieldName: string): readonly ValueFreeRule[] {
  if (fieldName !== DOCTOR_REPORT_FIELD) return VALUE_FREE_RULES;
  return VALUE_FREE_RULES.filter((rule) => rule.id !== "vf.marker");
}

/**
 * Every rule that refuses this one piece of text, in rule order; empty means it may be filed.
 *
 * @throws TypeError when `text` is not a string — an absent field is `""`.
 */
export function rulesRefusing(text: string): readonly ValueFreeRule[] {
  if (typeof text !== "string") {
    throw new TypeError('the gate reads text, never null — an absent field is ""');
  }
  return VALUE_FREE_RULES.filter((rule) => rule.refuses(text));
}

/**
 * Every violation across a report's named fields.
 *
 * @param fields field name to its text, in the order a refusal should list them.
 * @throws TypeError when the map is missing or any value is not a string — the drafter represents
 * an absent field as `""`, so a nullish value here is a caller's bug and must not be read as empty.
 */
export function valueFreeViolations(
  fields: ReadonlyMap<string, string>,
): readonly ValueFreeViolation[] {
  if (!(fields instanceof Map)) {
    throw new TypeError("the gate reads a report's fields, never null");
  }
  const violations: ValueFreeViolation[] = [];
  for (const [field, text] of fields) {
    if (typeof text !== "string") {
      throw new TypeError(`field "${field}" is not text — an absent field is ""`);
    }
    for (const rule of rulesFor(field)) {
      if (rule.refuses(text)) violations.push({ field, rule });
    }
  }
  return violations;
}
