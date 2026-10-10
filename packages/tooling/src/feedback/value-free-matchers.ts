// SPDX-License-Identifier: BUSL-1.1
// Licensed under the Business Source License 1.1 (see LICENSE); Change Date: four years from publication; Change License: Apache-2.0
// Copyright (c) 2026 Empower Agile
/**
 * The deciding half of the value-free rules: one predicate per rule, each testable on its own
 * without building a report around it.
 *
 * @llmNote Every pattern is a module-level literal, compiled once when this module is first
 * evaluated. A rule runs over every field of every report the verb drafts, so a per-call
 * `new RegExp` would be paid on the one path that must never be the slow one a user skips.
 *
 * @llmNote Every pattern below is used with `.test()` only, never `.exec()` in a loop, and none
 * carries the `g` flag — a global regexp carries `lastIndex` between calls, which would make a
 * shared module-level pattern answer differently on its second call with the same input. The two
 * places that DO need every match ({@link assignedKeys}, {@link entropy}) build their own matcher
 * state from a `g`-flagged pattern via `matchAll`, which is re-entrant.
 */

/**
 * `Name.method(param: value` — an identifier, a colon and something after it, inside a call line's
 * parentheses. The colon is what separates a rendered call from a structural one: the `.nt` form
 * writes `Name.method(param, param)` and never a value.
 *
 * @edgeCase A Markdown renderer emphasises the qualified name (`- **Name.method**(param: value)`),
 * so one optional emphasis marker (`**`, `__`, `*`, `_`) may sit between the method and the
 * parenthesis — written as a bounded class (`[*_]{0,2}`), never as the alternation
 * `(?:\*\*|__|\*|_)?`: overlapping alternatives are the shape a ReDoS gate rejects (the Java
 * reference's SpotBugs gate did), and the stray mixed pair (`*_`) the class also admits only makes
 * this deny rule stricter. The shared hostile corpus carries that line as a rejected row and its
 * names-only twin as an accepted one (cross-port finding of 2026-10-09, mirrored from the Java
 * reference).
 */
const RENDERED_CALL = /\w+\.\w+[*_]{0,2}\([^)]*\b\w+:\s*\S/;

/**
 * An outcome arrow followed by something other than the structural literal `value`. The other two
 * structural outcomes carry no arrow at all (`!! TypeName`, `?? incomplete`), so they cannot reach
 * this pattern; a rendered return always does.
 */
const RENDERED_OUTCOME = /→\s*(?!value\b)\S/;

/**
 * The rendered narrative's own duration suffix: an em dash, a number and a time unit. Anchored on
 * the em dash rather than on the number alone, so a version coordinate and a finding count — the
 * two numbers a legitimate report is full of — are not durations.
 */
const DURATION = /—\s*\d+(\.\d+)?\s?(ns|µs|ms|s)\b/;

/**
 * The runtime's redaction marker, written out rather than imported: this library declares zero
 * dependencies and never links against the runtime it diagnoses. The cross-module security suite
 * asserts this literal equals `RedactionPolicy.MARKER`, so the two cannot drift.
 */
export const REDACTION_MARKER = "[REDACTED]";

/**
 * One `key: value` or `key=value` binding, capturing the key. Keys are matched with Unicode-aware
 * classes so a Spanish or Chinese field name is a word here too, and bounded in length so a
 * pathological line cannot make this quadratic.
 *
 * @llmNote `\p{M}` is in the key class, and leaving it out is a leak rather than an untidiness. A
 * Mac filesystem hands back `contraseña` DECOMPOSED — `n` followed by the combining tilde U+0303 —
 * and a key class of letters and digits alone stops at `contrasen`, fails to see the colon, and
 * then matches the single letter `a` after the mark as the key instead. The folding in
 * `canonicalKey` can only help a key that was captured whole. Corpus row
 * `named-secret-spanish-decomposed` is that bug; Java's own `\w` under
 * `UNICODE_CHARACTER_CLASS` already includes the mark categories, which is why the reference
 * implementation never had to say this.
 *
 * @llmNote The value is a LOOKAHEAD, not a consumed character, and that is not a
 * micro-optimisation. Consuming it ate the first letter of the next key, so in an indented YAML
 * paste the scan matched `datasource:` and then resumed inside `password`, read the key as
 * `assword` and let the credential through. Corpus row `named-secret-yaml-indented` is that bug.
 *
 * @llmNote The optional quotes are load-bearing for the SAME reason the lookahead is. A JSON key is
 * `"password": "hunter2"`, and the closing quote sits between the key and the colon — so without
 * them the one attachment every report carries, the doctor's own JSON, was the one format the
 * deny-list could not read at all. Corpus row `named-secret-json-quoted` is that bug.
 */
const KEYED_ASSIGNMENT = /["']?([\p{L}\p{N}\p{M}_.-]{1,80})["']?\s*[:=]\s*(?=\S)/gu;

/**
 * A run of base64 (and base64url `_`) characters long enough to be an encoded secret.
 *
 * @llmNote Neither the hyphen nor the SLASH is a run character, though base64 and base64url use
 * both. They are the two characters ordinary text uses as separators — prose and doc anchors
 * hyphenate, and every URL and every path is slash-separated — and admitting either makes a
 * sequence of ordinary words measure like one dense token, because the measurement is of the
 * concatenation. `the-quick-brown-fox-jumps-over-the-lazy` measures 4.33 bits per character, and
 * this project's own finding URLs measure 3.99 to 4.03 across the ceiling
 * (`.../blob/main/documentation/troubleshooting`) while no segment of one exceeds 3.4. A gate whose
 * verdict on a doctor report depends on which document the finding points at is a gate nobody can
 * rely on.
 *
 * @edgeCase The consequence, stated rather than hidden: a STANDARD-alphabet base64 blob whose
 * slashes fall every twenty-odd characters is split into segments too short to reach the floor. It
 * is then reached by its key's name (`vf.named-secret`), by its own shape (`vf.value-shape` covers
 * JWTs, PEM blocks and the five credential prefixes) or by a longer segment of itself, and the
 * rule's primary targets are untouched — credentials use base64url and hex precisely because they
 * have to travel inside URLs.
 */
const BASE64_RUN = /[A-Za-z0-9+=_]{32,}/g;

/**
 * A run of nothing but hex digits, long enough to be a hash, an HMAC or an opaque id.
 *
 * @llmNote Entropy is not the discriminator for hex and cannot be: sixteen symbols cap Shannon
 * entropy at 4.0 bits per character, and a measured sample of random hex runs of 32 to 128
 * characters never exceeded 3.97 — so the entropy ceiling below can never fire on hex, which is
 * half of what this rule is for. Length alone carries the hex half: no word is 32 hex digits.
 */
const HEX_RUN = /\b[0-9a-fA-F]{32,}\b/;

/** Bits per character above which an encoded run is treated as a secret rather than a word. */
const ENTROPY_CEILING = 4.0;

/**
 * An email address. The local part must be non-empty, which is what keeps a decorator reference
 * (`@narrated`) and a scoped package name (`@narrativetrace/core`) off this rule.
 */
const EMAIL = /[A-Za-z0-9._%+-]+@[A-Za-z0-9-]+\.[A-Za-z]{2,}/;

/**
 * The three platforms' home directories. Matched with a trailing separator and a non-empty account
 * segment, so `/home` or a relative `narrativetrace-output/` path is not one.
 */
const HOME_PATH = /(\/Users\/|\/home\/)[^/\s]+\/|[A-Za-z]:\\Users\\[^\\\s]+/i;

/**
 * Every C0 and C1 control character except the line feed and the tab a report legitimately has,
 * plus Unicode's own bidirectional controls and the byte-order mark.
 *
 * @llmNote The bidi characters are in scope because they are the attack this rule is for: a
 * right-to-left override in an issue title reorders what the person triaging it SEES without
 * changing a byte of what was filed. They carry the `Bidi_Control` property, so "control
 * character" is their own name for themselves, not a widening.
 *
 * @edgeCase Deliberately NOT all of `\p{Cf}`. The zero-width joiner and non-joiner are format
 * characters too, and they are load-bearing letters in Devanagari, Bengali and emoji sequences —
 * refusing them would refuse a report written in Hindi, and reports may be in any language.
 */
// biome-ignore lint/suspicious/noControlCharactersInRegex: refusing control characters is the rule.
const CONTROL = /[\x00-\x08\x0b-\x1f\x7f-\x9f\u202a-\u202e\u2066-\u2069\ufeff]/;

/** A rendered call line: `method(param: value)` carries the argument's value. */
export function renderedCall(text: string): boolean {
  return RENDERED_CALL.test(text);
}

/** A rendered outcome: an arrow followed by anything but the structural literal `value`. */
export function renderedOutcome(text: string): boolean {
  return RENDERED_OUTCOME.test(text);
}

/** A rendered duration: the elapsed time a value-free artifact never carries. */
export function duration(text: string): boolean {
  return DURATION.test(text);
}

/** The renderer's redaction marker, which no value-free artifact ever contains. */
export function marker(text: string): boolean {
  return text.includes(REDACTION_MARKER);
}

/** Every `key` this text assigns a value to, in the order they appear. */
export function assignedKeys(text: string): string[] {
  return [...text.matchAll(KEYED_ASSIGNMENT)].map((match) => match[1] as string);
}

/** The hex half decided by length, the base64 half by the density of its own alphabet. */
export function entropy(text: string): boolean {
  if (HEX_RUN.test(text)) return true;
  for (const run of text.matchAll(BASE64_RUN)) {
    if (shannonBitsPerCharacter(run[0]) > ENTROPY_CEILING) return true;
  }
  return false;
}

/** An email address — somebody's personal data, whoever's it is. */
export function email(text: string): boolean {
  return EMAIL.test(text);
}

/** An absolute home directory, which carries whoever's login name. */
export function homePath(text: string): boolean {
  return HOME_PATH.test(text);
}

/** A control character: never content, always a terminal escape or a smuggled byte. */
export function control(text: string): boolean {
  return CONTROL.test(text);
}

/**
 * Shannon entropy of the run's own character distribution, in bits per character.
 *
 * @llmNote A `Map` histogram rather than a fixed array: the run is ASCII by construction of the
 * patterns above, but a histogram that depends on that invariant would silently mis-measure if the
 * alphabet ever widened, and "mis-measures quietly" is the one failure mode this rule cannot have.
 */
function shannonBitsPerCharacter(run: string): number {
  const counts = new Map<string, number>();
  for (const character of run) counts.set(character, (counts.get(character) ?? 0) + 1);
  let bits = 0;
  for (const count of counts.values()) {
    const share = count / run.length;
    bits -= share * Math.log2(share);
  }
  return bits;
}
