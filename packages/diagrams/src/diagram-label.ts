// SPDX-License-Identifier: BUSL-1.1
// Licensed under the Business Source License 1.1 (see LICENSE); Change Date: four years from publication; Change License: Apache-2.0
// Copyright (c) 2026 Empower Agile
import { identifier as sanitizeIdentifier, message as sanitizeMessage } from "./diagram-text.js";

declare const DiagramLabelBrand: unique symbol;

/**
 * One piece of diagram text guaranteed to have passed through `diagram-text.ts`, the one
 * sanitizer both sequence grammars share. Port of the Java reference's `DiagramLabel` (the
 * runtime's micro-type idiom: a branded string, constructed only through this module's factories).
 *
 * INTENT: "call the sanitizer before a string enters a diagram line" used to be a convention every
 * call site had to remember on its own — {@link identifier}/{@link message}/{@link alias} are the
 * only routes from untrusted trace metadata into a label, so a `SequenceGrammar` hook declaring a
 * `DiagramLabel` parameter cannot be satisfied by an un-sanitized string literal (see
 * `shape-checks/sequence-grammar-shape.ts`).
 *
 * @remarks TS branding is a compile-time discipline, not a runtime seal the way Java's private
 * constructor is: a caller willing to write `"raw" as unknown as DiagramLabel` can still forge one
 * — {@link DiagramLabelBrand} is deliberately unexported so no *ordinary* assignment or accidental
 * `as DiagramLabel` on a wider type reaches a grammar hook, which is the realistic bar for a
 * structural type system. {@link withParameters} and {@link quoted} compose already-sanitized
 * labels with literal punctuation that never came from the trace (`(`, `, `, `"`), so composition
 * can never reopen the hole the sanitizer closed.
 */
export type DiagramLabel = string & { readonly [DiagramLabelBrand]: true };

const NEEDS_QUOTE = /[ .:<>-]/;

/**
 * Sanitizes one piece of trace metadata (class/participant name) for interpolation into either
 * diagram grammar. See `diagram-text.ts`'s `identifier`.
 *
 * @param raw the metadata field as captured, which may be anything
 */
function identifier(raw: string): DiagramLabel {
  return sanitizeIdentifier(raw) as DiagramLabel;
}

/**
 * Folds control characters in interpolated message text (a rendered return value, a method or
 * parameter name) so it cannot inject a new diagram line. See `diagram-text.ts`'s `message`.
 */
function message(text: string): DiagramLabel {
  return sanitizeMessage(text) as DiagramLabel;
}

/**
 * Closes construction for a Mermaid participant alias token already derived from an
 * {@link identifier}-sanitized class name (see `sequence-walk.ts`'s `collectParticipants`, which
 * is `generateAlias`'s only caller).
 *
 * @remarks Not a fresh sanitization pass, unlike {@link identifier}/{@link message}: `generateAlias`
 * only ever reads characters out of a name this module already sanitized, so nothing untrusted
 * reaches this factory directly — it exists so the alias generator's plain-`string` output has one
 * documented route into the label type rather than an ad hoc cast at each call site. This is the
 * one factory that does not map to a distinct Java `DiagramText.aliasToken` sanitizer pass — see
 * the mirror brief's report for why TS's alias derivation already differs from Java's.
 */
function alias(computedAlias: string): DiagramLabel {
  return computedAlias as DiagramLabel;
}

/**
 * This label (a sanitized method name) followed by its already-sanitized parameter labels,
 * comma-joined and parenthesized: `method(paramA, paramB)`. The parentheses and separator are
 * literal, not trace-derived, so this cannot reintroduce anything the sanitizer folded.
 */
function withParameters(label: DiagramLabel, parameters: readonly DiagramLabel[]): DiagramLabel {
  return `${label}(${parameters.join(", ")})` as DiagramLabel;
}

/**
 * This label, quoted when it contains a character that would otherwise end an unquoted token
 * (`. - : < >` or a space) — the label a participant declaration's display name uses. The quotes
 * are literal, not trace-derived.
 */
function quoted(label: DiagramLabel): DiagramLabel {
  return (NEEDS_QUOTE.test(label) ? `"${label}"` : label) as DiagramLabel;
}

export const DiagramLabel = { identifier, message, alias, withParameters, quoted };
