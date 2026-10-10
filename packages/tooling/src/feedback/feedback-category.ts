// SPDX-License-Identifier: BUSL-1.1
// Licensed under the Business Source License 1.1 (see LICENSE); Change Date: four years from publication; Change License: Apache-2.0
// Copyright (c) 2026 Empower Agile
/**
 * Which part of NarrativeTrace a problem report is about — the one field that decides where the
 * report is triaged and what it must carry.
 *
 * INTENT: a closed set, not free text. The issue form renders it as a dropdown, the label
 * `category:<id>` comes from it, and {@link FeedbackCategory.requiresDoctorReport} is the one rule
 * that depends on it: a complaint about the doctor or about a skill is unarguable only with the
 * doctor's own JSON beside it, while a complaint about the published prompt or about the library
 * may be filed from a project whose doctor cannot run at all.
 */
export interface FeedbackCategory {
  /** The lower-case id the issue form's dropdown and the `category:` label carry. */
  readonly id: string;
  /** Whether a report in this category is only meaningful with the doctor's JSON attached. */
  readonly requiresDoctorReport: boolean;
}

/** The four categories, in the order the form's dropdown offers them. */
export const FEEDBACK_CATEGORIES: readonly FeedbackCategory[] = [
  /** The published install prompt, or any text an adopter was told to follow. */
  { id: "prompt", requiresDoctorReport: false },
  /** A catalogue skill: a step that does not work, a verify that cannot be met, wrong wording. */
  { id: "skill", requiresDoctorReport: true },
  /** A doctor check: wrong finding, wrong fix, a fix that does not work. */
  { id: "doctor", requiresDoctorReport: true },
  /** The library itself: capture, rendering, redaction, an integration. */
  { id: "library", requiresDoctorReport: false },
];

/**
 * The category with this id.
 *
 * @throws RangeError on an unknown id — a category is a closed set, and a silent fallback would
 * file a report into the wrong triage queue.
 */
export function feedbackCategory(id: string): FeedbackCategory {
  const found = FEEDBACK_CATEGORIES.find((category) => category.id === id);
  if (found === undefined) {
    throw new RangeError(`unknown category "${id}" — one of prompt, skill, doctor or library`);
  }
  return found;
}
