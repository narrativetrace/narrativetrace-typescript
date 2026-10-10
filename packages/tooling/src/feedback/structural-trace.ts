// SPDX-License-Identifier: BUSL-1.1
// Licensed under the Business Source License 1.1 (see LICENSE); Change Date: four years from publication; Change License: Apache-2.0
// Copyright (c) 2026 Empower Agile
/**
 * Whether a file is a structural trace — the one artifact a report may attach, because it is the
 * one artifact that carries no runtime value by construction.
 *
 * INTENT: defence in depth over the value-free rules, not a substitute for them. The rules decide
 * about TEXT; this decides about a FILE's claim to be a `.nt`. A rendered narrative copied to a
 * `.nt` name is caught by the rules anyway — it is full of values — but a file that passes the
 * rules while not being a structural trace at all (a log with nothing interesting in it, a
 * half-written note) is not the attachment the report promises, and attaching it would put an
 * unreviewed file shape into a public issue.
 *
 * @llmNote The grammar is the published one (`documentation/structural-trace-format.md`): a
 * `scenario:` header, then call lines `Type.method(name, name)` with an optional outcome of the
 * returned marker, `!! TypeName` or the incomplete marker, plus the concurrency markers this
 * runtime's own renderer emits — either may open with a span id such as `#1.3`. Anything else makes
 * the whole file not-a-structural-trace.
 * Loosening this means loosening what a report may attach, so loosen the FORMAT first and this
 * after.
 *
 * @llmNote Two of the shapes accepted here are this runtime's and are NOT in the Java reference's
 * grammar check: `~ fire-and-forget` carries no bracketed count (there is no group to count), and a
 * call line may end in ` … (cycle)` or ` … (depth limit)` where the tree walk refused to descend.
 * `structural-trace-renderer.ts` writes both, so a grammar that refused them would refuse this
 * runtime's real artifacts.
 *
 * @llmNote A call line is taken apart with `indexOf` and one-quantifier patterns rather than
 * matched by a single regexp. The obvious regexp needs a nested quantifier for the dotted name,
 * which is a backtracking hazard — and a check that has to be excused by a scanner exclusion is a
 * check nobody trusts.
 */

/**
 * One identifier: a class name, a method name, a parameter name. No dot, by construction.
 *
 * @llmNote Unicode-aware, and `\w` would not be. A JavaScript identifier may be any Unicode
 * letter, the renderer passes an identifier through untouched (`ControlEscape.sanitize` only folds
 * control characters), and this product's whole position is that a project may be written in any
 * language — a deny-list in five of them, reports in any. With ASCII-only segments a class named
 * `注文Service` made the WHOLE file "not a structural trace", so a project naming its code in a
 * non-Latin script could never attach a trace to a report at all. Found by the adversarial pass,
 * whose own test had documented the ASCII behaviour as correct.
 */
const SEGMENT = /^[\p{L}\p{N}\p{M}_$]+$/u;

/** The whole parameter list: names, commas and spaces. Never a colon, never a value. */
const PARAMETERS = /^[\p{L}\p{N}\p{M}_$, ]*$/u;

const HEADER = /^scenario: \S.*$/;

/** A concurrency marker with an optional bracketed count, e.g. `~ fork [2]`. */
const MARKER_LINE = /^\s*~ [\w-]+( \[\d+\])?$/;

const BULLET = "- ";
const RETURNED = " → value";
const INCOMPLETE = " ?? incomplete";
const THREW = " !! ";

/** What the tree walk appends where it refused to descend — this runtime's own two markers. */
const WALK_MARKERS = [" … (cycle)", " … (depth limit)"];

/** A dotted name of at least `minimumSegments` identifier segments. */
function isDottedName(name: string, minimumSegments: number): boolean {
  const segments = name.split(".");
  return segments.length >= minimumSegments && segments.every((part) => SEGMENT.test(part));
}

/** Nothing (void), the returned marker, a thrown type name, or the incomplete marker. */
function isOutcome(suffix: string): boolean {
  if (suffix === "" || suffix === RETURNED || suffix === INCOMPLETE) return true;
  return suffix.startsWith(THREW) && isDottedName(suffix.slice(THREW.length), 1);
}

/**
 * The call with any walk marker taken off the end — a stopped node is a leaf either way.
 *
 * @llmNote This runs BEFORE the parentheses are located, and the order is the whole point: a walk
 * marker carries its own parentheses (`… (cycle)`), so `lastIndexOf(")")` on the untrimmed line
 * finds the marker's closing paren and reads `c) … (cycle` as the parameter list. The Java
 * reference never faced this because its renderer emits no such marker.
 */
function withoutWalkMarker(call: string): string {
  const marker = WALK_MARKERS.find((candidate) => call.endsWith(candidate));
  return marker === undefined ? call : call.slice(0, -marker.length);
}

/** `Type.method(a, b)` plus at most one outcome marker. */
function isCall(call: string): boolean {
  const open = call.indexOf("(");
  const close = call.lastIndexOf(")");
  if (open < 0 || close < open) return false;
  return (
    isDottedName(call.slice(0, open), 2) &&
    PARAMETERS.test(call.slice(open + 1, close)) &&
    isOutcome(call.slice(close + 1))
  );
}

/** `- Type.method(a, b)`, with any outcome and any walk marker behind it. */
function isCallLine(line: string): boolean {
  const bullet = line.trim();
  if (!bullet.startsWith(BULLET)) return false;
  return isCall(withoutWalkMarker(bullet.slice(BULLET.length)));
}

/**
 * The line without the span id it may open with (`#1.3.2`, after the indent): a position path, so
 * it carries no value. Anything after the indent that starts with `#` but is not a well-formed path
 * is left in place, and then fails the line.
 *
 * @llmNote Mirrors `CitableSpanId.strip` in `@narrativetrace/core`; this package carries no
 * runtime dependency by contract, so the grammar is restated rather than linked (Java does the
 * same in its zero-dependency tooling module).
 */
function withoutSpanId(line: string): string {
  let start = 0;
  while (line[start] === " ") start++;
  if (line[start] !== "#") return line;
  let i = start + 1;
  let digitsInRun = 0;
  for (; i < line.length; i++) {
    const c = line[i] as string;
    if (c >= "0" && c <= "9") digitsInRun++;
    else if (c === "." && digitsInRun > 0) digitsInRun = 0;
    else break;
  }
  const wellFormed = digitsInRun > 0 && line[i] === " ";
  return wellFormed ? line.slice(0, start) + line.slice(i + 1) : line;
}

function isBodyLine(shape: string): boolean {
  return isCallLine(shape) || MARKER_LINE.test(shape);
}

/**
 * Whether this content parses as a structural trace.
 *
 * @throws TypeError when `content` is not a string — an absent file is `""`.
 */
export function looksStructural(content: string): boolean {
  if (typeof content !== "string") {
    throw new TypeError('the grammar check reads content, never null — an absent file is ""');
  }
  let headerSeen = false;
  // CRLF is a checkout's line ending (core.autocrlf), and a leading byte-order mark an editor's
  // save adds — both encoding, neither a different file: the grammar is per line.
  for (const line of content.replace(/^\uFEFF/, "").split(/\r?\n/)) {
    if (line.trim() === "") continue;
    if (!headerSeen) {
      headerSeen = HEADER.test(line);
      if (!headerSeen) return false;
    } else if (!isBodyLine(withoutSpanId(line))) {
      return false;
    }
  }
  return headerSeen;
}
