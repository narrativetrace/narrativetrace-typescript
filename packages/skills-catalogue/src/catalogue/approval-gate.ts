// SPDX-License-Identifier: BUSL-1.1
// Licensed under the Business Source License 1.1 (see LICENSE); Change Date: four years from publication; Change License: Apache-2.0
// Copyright (c) 2026 Empower Agile
import type { ReasonedRule } from "../skill.js";

/**
 * The approval gate every skill uses before it turns something it SHOWED into something durable or
 * public: show the whole artifact, ask once and stop the turn, and act only on what was shown. Port
 * of Java `ApprovalGate`.
 *
 * INTENT: the feedback skill files a public issue and the verify and debug skills promote a
 * committed approval baseline; both are a person's decision, made on an artifact they read, in a
 * turn of their own. Written once so every skill states the gate in the same words — a rule
 * restated by hand is a rule that drifts — with only the artifact and the act filled in.
 */
export const ApprovalGate = {
  /** The clause a "show it" step is judged by: the artifact itself, whole, is in the reply. */
  shownWhole(artifact: string): string {
    return `the whole text of ${artifact} is in the reply, not a summary of it`;
  },

  /**
   * The flag of the "ask once" step, followed by what must not happen before the yes.
   *
   * @param beforeTheYes the act this skill must not start before the user's answer, as a sentence.
   */
  askedThenStopped(beforeTheYes: string): string {
    return `judgmental — the reply ends with the question and nothing after it; the answer is the user's next message, never something assumed in this one. ${beforeTheYes}`;
  },

  /** "Show the whole draft before asking anything", with this skill's reason. */
  showTheWholeBeforeAsking(artifact: string, reason: string): ReasonedRule {
    return { rule: `Show the whole ${artifact} before asking anything`, reason };
  },

  /** "Never file in the turn that asked" — the yes is the user's next message. */
  neverInTheTurnThatAsked(act: string): ReasonedRule {
    return {
      rule: `Never ${act} in the turn that asked`,
      reason: "approval is the user's next message — a yes assumed in the same turn is not one",
    };
  },

  /**
   * "Never edit the draft after showing it" — what was approved is what is acted on.
   *
   * @param artifact what was shown, as the rule names it (`"draft"`).
   * @param actedOn the act in the past tense (`"filed"`).
   * @param changed what a change produces, and how it is made again (`"report is drafted"`).
   */
  neverEditAfterShowing(artifact: string, actedOn: string, changed: string): ReasonedRule {
    return {
      rule: `Never edit the ${artifact} after showing it`,
      reason: `what was approved has to be what is ${actedOn}, so a changed ${changed} again and shown again`,
    };
  },
} as const;
