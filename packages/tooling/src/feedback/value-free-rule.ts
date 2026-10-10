// SPDX-License-Identifier: BUSL-1.1
// Licensed under the Business Source License 1.1 (see LICENSE); Change Date: four years from publication; Change License: Apache-2.0
// Copyright (c) 2026 Empower Agile
import { containsASecretShape, namesASecret } from "./secret-vocabulary.js";
import {
  assignedKeys,
  control,
  duration,
  email,
  entropy,
  homePath,
  marker,
  renderedCall,
  renderedOutcome,
} from "./value-free-matchers.js";

/**
 * The hard gate between a problem report and a leaked secret: one named rule per shape of runtime
 * value that must never reach a public issue.
 *
 * INTENT: a report drafted by an agent is PUBLIC from the first second — there is no private inbox
 * to triage it first — so the only thing standing between a pasted trace and somebody's credential
 * is a check the verb runs before it will build a URL or a body file. Each rule carries a stable
 * `vf.*` id because the refusal has to name what to fix, not just say no.
 *
 * @llmNote Data here, code in `value-free-matchers.ts`: an entry is an id, a reason a person reads,
 * and a reference to the predicate that decides. Adding a rule means adding an entry and a
 * predicate, never an `if` inside a caller — the gate walks {@link VALUE_FREE_RULES} and cannot
 * know about a rule that is not in it.
 *
 * @llmNote These rules are deliberately STRICTER than the renderer's own redaction
 * (`RedactionPolicy` in the runtime this library never links against). The renderer refuses an
 * entropy heuristic because a false positive there silently blanks a user's data; here a false
 * positive is a refusal that names its rule and a false negative is a public leak, so the tradeoff
 * inverts. The cross-module security suite asserts the implication that matters — every value the
 * renderer redacts is also rejected here — and asserts it in that direction ONLY.
 */
export interface ValueFreeRule {
  /** The stable rule id a refusal names, e.g. `vf.rendered-call`. */
  readonly id: string;
  /** Why this shape may not be filed, in the words the refusal prints. */
  readonly reason: string;
  /**
   * Whether this rule refuses the given text.
   *
   * @throws TypeError when `text` is null or undefined — an absent field is `""` to every caller
   * in this package, so a nullish value here is a programming error, not empty input.
   */
  readonly refuses: (text: string) => boolean;
}

/** A deny-listed name immediately followed by a value, anchored on the key being ASSIGNED. */
function namedSecret(text: string): boolean {
  return assignedKeys(text).some(namesASecret);
}

function reading(text: string): string {
  if (typeof text !== "string") {
    throw new TypeError('a value-free rule reads text, never null — an absent field is ""');
  }
  return text;
}

/** Wraps a predicate in the one guard clause every rule shares. */
function rule(id: string, reason: string, decides: (text: string) => boolean): ValueFreeRule {
  return { id, reason, refuses: (text) => decides(reading(text)) };
}

/**
 * Every rule, in declaration order — the order a refusal lists them in.
 *
 * The ids are a cross-runtime contract: a refusal names one, the shared `hostile-corpus/
 * feedback.json` asserts one, and a report filed in another runtime's repository quotes one.
 */
export const VALUE_FREE_RULES: readonly ValueFreeRule[] = [
  rule(
    "vf.rendered-call",
    "a call line carries a parameter's VALUE — attach the structural trace (.nt) instead, which" +
      " carries the same shape without any value",
    renderedCall,
  ),
  rule(
    "vf.rendered-outcome",
    "an outcome arrow carries a RETURNED VALUE — the structural trace writes a bare → value, an" +
      " exception TYPE after !!, or ?? incomplete, and never a value",
    renderedOutcome,
  ),
  rule(
    "vf.duration",
    "an elapsed time is a runtime measurement, which means this text came from a rendered" +
      " narrative rather than from the structural trace",
    duration,
  ),
  rule(
    "vf.marker",
    "the redaction marker only appears where a value was redacted, so this text is a rendered" +
      " narrative — the structural trace has nothing to redact and never carries it",
    marker,
  ),
  rule(
    "vf.named-secret",
    "a field whose NAME says it holds a credential is shown with a value beside it — remove the" +
      " value; the name alone is shape and may stay",
    namedSecret,
  ),
  rule(
    "vf.value-shape",
    "a value here is shaped like a credential, a key, a national id or a card number — remove it;" +
      " a report never needs the value, only what happened",
    containsASecretShape,
  ),
  rule(
    "vf.entropy",
    "a long encoded run here looks like a key, a hash or an opaque identifier — remove it; if it" +
      " is genuinely not a secret, describe it in words instead of pasting it",
    entropy,
  ),
  rule(
    "vf.email",
    "an email address is personal data and a public issue is public forever — remove it; the" +
      " report does not need to say who",
    email,
  ),
  rule(
    "vf.home-path",
    "an absolute home directory names the account it belongs to — the draft rewrites these to ~" +
      " on its own, so one here means the text was edited by hand afterwards",
    homePath,
  ),
  rule(
    "vf.control",
    "a control character is not text a reader needs and is how a payload hides in one — only a" +
      " line feed and a tab belong in a report",
    control,
  ),
];

/**
 * The rule with this id.
 *
 * @throws RangeError on an unknown id — the rule set is closed, and a caller asking about a rule
 * that does not exist is asking the wrong question rather than one with a sensible default.
 */
export function valueFreeRule(id: string): ValueFreeRule {
  const found = VALUE_FREE_RULES.find((candidate) => candidate.id === id);
  if (found === undefined) {
    throw new RangeError(`no value-free rule has the id "${id}"`);
  }
  return found;
}
