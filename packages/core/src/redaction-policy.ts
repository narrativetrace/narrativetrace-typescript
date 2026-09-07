// SPDX-License-Identifier: BUSL-1.1
// Licensed under the Business Source License 1.1 (see LICENSE); Change Date: four years from publication; Change License: Apache-2.0
// Copyright (c) 2026 Empower Agile
import { isSecretShaped } from "./secret-value-shapes.js";

const DEFAULT_PATTERNS = [
  "password",
  "passwd",
  "secret",
  "token",
  "apikey",
  "api_key",
  "cvv",
  "ssn",
  "authorization",
  "credential",
  "privatekey",
  "private_key",
  "cardnumber",
  "card_number",
  "jwt",
  "cookie",
  "setcookie",
  "set_cookie",
  "sessionid",
  "session_id",
  "accountnumber",
  "account_number",
  "routingnumber",
  "routing_number",
  "pan",
  "iban",
];

/**
 * Patterns that must never match as a bare substring — `"company".includes("pan")` is true, and a
 * security default that blanks ordinary business fields (`companyName`, `panelId`, `planId`,
 * `japaneseAddress`, …) gets switched off wholesale, which is worse than the gap it closes. Matched
 * on identifier-token boundaries instead, applied regardless of which policy holds the pattern —
 * a caller's own {@link RedactionPolicy.ofPatterns} list gets the same protection.
 */
const TOKEN_BOUNDARY_PATTERNS: ReadonlySet<string> = new Set(["pan", "iban"]);

/** Splits an identifier into lowercase tokens on delimiters and camelCase/acronym boundaries —
 * `"cardPAN"` and `"PANNumber"` both yield a `"pan"` token; `"panelId"` does not. */
function identifierTokens(name: string): string[] {
  return name
    .replace(/([a-z0-9])([A-Z])/g, "$1 $2")
    .replace(/([A-Z]+)([A-Z][a-z])/g, "$1 $2")
    .split(/[^a-zA-Z0-9]+/)
    .filter((token) => token.length > 0)
    .map((token) => token.toLowerCase());
}

/**
 * Redacts values whose field name matches a case-insensitive substring deny-list.
 *
 * Substring (not exact) matching is deliberate — it catches `userPassword`, `cardCvv`,
 * `apiToken` — erring toward over-redaction, the safe default for a security control.
 * Teams tracing fields that collide with a pattern override the set via {@link ofPatterns}
 * or opt out with {@link DISABLED}. Port of Java `render/RedactionPolicy`.
 */
export class RedactionPolicy {
  /** Marker emitted in place of a redacted value, matching the not-traced marker. */
  static readonly MARKER = "[REDACTED]";

  /** Secure default: redacts values for common sensitive field-name patterns and by value shape. */
  static readonly DEFAULT = new RedactionPolicy(DEFAULT_PATTERNS, true);

  /** Opt-out policy that redacts nothing by name or value shape (annotations still apply). */
  static readonly DISABLED = new RedactionPolicy([], false);

  private readonly lowerPatterns: readonly string[];
  private readonly valueShapesEnabled: boolean;

  private constructor(patterns: Iterable<string>, valueShapesEnabled: boolean) {
    this.lowerPatterns = Array.from(patterns, (p) => p.toLowerCase());
    this.valueShapesEnabled = valueShapesEnabled;
  }

  /**
   * Creates a policy with a custom set of case-insensitive substring patterns, replacing the
   * defaults entirely. Value-shape masking ({@link shouldRedactValue}) stays on — a custom name
   * list is not an opinion about whether these bytes are a credential.
   */
  static ofPatterns(patterns: Iterable<string>): RedactionPolicy {
    return new RedactionPolicy(patterns, true);
  }

  /** Whether a value should be redacted based on its field name. */
  shouldRedact(fieldName: string | null | undefined): boolean {
    if (fieldName == null) return false;
    const lower = fieldName.toLowerCase();
    return this.lowerPatterns.some((pattern) => this.matchesPattern(pattern, lower, fieldName));
  }

  private matchesPattern(pattern: string, lower: string, original: string): boolean {
    if (!TOKEN_BOUNDARY_PATTERNS.has(pattern)) return lower.includes(pattern);
    return lower === pattern || identifierTokens(original).includes(pattern);
  }

  /**
   * Whether a scalar string value should be redacted by its own structural shape (JWT, PAN,
   * `Set-Cookie`) — independent of field name, so an unnamed value (a list item, a map value)
   * is still caught. See {@link isSecretShaped}. Off under {@link DISABLED}.
   */
  shouldRedactValue(value: string): boolean {
    return this.valueShapesEnabled && isSecretShaped(value);
  }

  /**
   * The single redaction decision for a named member: an explicit `static notTraced` annotation
   * always redacts, and otherwise the name-based deny-list decides.
   *
   * INTENT: every surface that can name a member — {@link renderValue}'s field introspection, its
   * `renderStructured` twin, and `@narrated`/`@onError` template paths — asks this one method
   * rather than each holding its own copy of `annotated || shouldRedact(name)`. Two
   * implementations of "is this redacted?" would drift, and a drifted redaction rule is a leak on
   * whichever surface fell behind. Port of Java `RedactionPolicy.isRedacted`.
   *
   * @param memberName the field/property name being rendered or resolved.
   * @param annotated whether that member is explicitly listed in `static notTraced`.
   */
  isRedacted(memberName: string, annotated: boolean): boolean {
    return annotated || this.shouldRedact(memberName);
  }
}

const NO_FIELDS: ReadonlySet<string> = new Set();

/**
 * The property-level not-traced surface: a class exposes `static notTraced = ["field", ...]`
 * listing property names that must never be rendered or resolved, independently of the active
 * {@link RedactionPolicy}.
 *
 * INTENT: shared by field introspection ({@link renderValue}, `renderStructured`) and
 * `@narrated`/`@onError` template path resolution, so "is this member explicitly annotated?" has
 * one answer rather than a copy per call site.
 */
export function notTracedFields(value: object): ReadonlySet<string> {
  const list = (value.constructor as { notTraced?: unknown } | undefined)?.notTraced;
  return Array.isArray(list) ? new Set(list.map(String)) : NO_FIELDS;
}
