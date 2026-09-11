// SPDX-License-Identifier: BUSL-1.1
// Licensed under the Business Source License 1.1 (see LICENSE); Change Date: four years from publication; Change License: Apache-2.0
// Copyright (c) 2026 Empower Agile
import { canonical, isSecretShaped } from "./secret-value-shapes.js";

// The default vocabulary is multilingual and always on (family standard, ported from the Java
// runtime's RedactionPolicy): Spanish, Portuguese, French and Chinese words sit beside the
// English ones, with no locale to select and nothing to opt into. A deny-list that only reads
// English hides a `password` field and shows the `contraseña` beside it — not a weaker guarantee
// but a differently-distributed one: it protects whoever happens to name fields in the language
// the list was written in. Patterns are written folded (no accents); `canonical` folds both
// sides, so the accented and unaccented spellings of a word are one pattern rather than two.
const DEFAULT_PATTERNS = [
  // English
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
  // Family-wide audit (2026-09): absent from every runtime, this one included.
  "passphrase",
  "bearer",
  "accesskey",
  "access_key",
  "socialsecurity",
  "social_security",
  "socialsecuritynumber",
  "taxid",
  "tax_id",
  // ("pan"/"iban"/"otp" live in TOKEN_BOUNDARY_PATTERNS below, not here — see that set's note for
  // why they, and the non-English words beside them, match as whole identifier tokens.)
  // Spanish: contraseña, tarjeta, cédula — written folded, matched either way via canonical
  "contrasena",
  "tarjeta",
  "cedula",
  // Spanish: bare "clave" was narrowed away (family ruling 2026-09-03) — it matched
  // clavePrimaria and claveForanea, ordinary database terms, not credentials. These two
  // compounds are the unit instead; both spellings, because the underscore is part of the name
  // being matched.
  "claveacceso",
  "clave_acceso",
  "clavesecreta",
  "clave_secreta",
  // Portuguese: cartão
  "cartao",
  // French: both spellings, because the underscore is part of the name being matched
  "motdepasse",
  "mot_de_passe",
  // French: bare "carte" was narrowed away (family ruling 2026-09-03) — it matched
  // carteGraphique and carteRoutiere, ordinary identifiers, not credentials. These two
  // compounds are the unit instead; both spellings, same reason as above.
  "cartebancaire",
  "carte_bancaire",
  "numerocarte",
  "numero_carte",
  // German: Passwort/Kennwort ("password"/"passcode") — folded, so accented and unaccented
  // spellings (irrelevant here, ASCII already) share the one pattern like every other language.
  "passwort",
  "kennwort",
  // Chinese: 密码 (mima, "password") and 身份证 (identity card), plus the pinyin a codebase
  // without CJK identifiers writes instead
  "密码",
  "身份证",
  "shenfenzheng",
];

/**
 * Patterns that must never match as a bare substring — `"company".includes("pan")` is true, and a
 * security default that blanks ordinary business fields (`companyName`, `panelId`, `planId`,
 * `japaneseAddress`, …) gets switched off wholesale, which is worse than the gap it closes.
 * Matched on identifier-token boundaries instead (or as the whole field name, for a run-together
 * case like `IbAn` that tokenizing alone would split apart), applied regardless of which policy
 * holds the pattern — a caller's own {@link RedactionPolicy.ofPatterns} list gets the same
 * protection.
 *
 * Every non-English word here earned its place by colliding with a real business field, which is
 * why the set is not simply "the short ones": `rut` is inside `truth`, `brute` and `scrutiny`;
 * `cuit` inside `circuit` and `biscuit`; `dni` inside `midnight`; `nir` inside `nirvana`; `mima`
 * inside `semiMajorAxis` once the case boundary is lower-cased away. `senha` is the subtle one —
 * no English word contains it, but `chosenHash` and `frozenHash` do, across the camelCase seam.
 * `cpf` and `cnpj` are here for length alone. `otp` (2026-09 family-wide audit addition) is here
 * for the identical reason `pan`/`iban` are: `"footprint".includes("otp")`,
 * `"hotplate".includes("otp")`, `"hotpot".includes("otp")` and `"footpath".includes("otp")` are
 * all true, and every one is an ordinary field a codebase can plausibly carry (`carbonFootprintId`
 * not least). A camelCase/snake_case/all-caps OTP field (`otpCode`, `userOtp`, `OTP_SECRET`) still
 * yields its own `otp` token, so nothing real is lost by matching it here instead of as a bare
 * substring. (`clave` and `carte` do NOT belong here even though both are short — a token match
 * only protects a short word from *someone else's* compound; it cannot protect a codebase's own
 * `clavePrimaria` or `carteGraphique` from a pattern that *is* their prefix. Both live in the
 * substring list as the specific credential compounds instead.)
 */
const TOKEN_BOUNDARY_PATTERNS: ReadonlySet<string> = new Set([
  "pan",
  "iban",
  "otp",
  "rut",
  "cuit",
  "dni",
  "senha",
  "cpf",
  "cnpj",
  "nir",
  "mima",
]);

/** Splits an identifier into canonical (lower-cased, accent-folded) tokens on delimiters and
 * camelCase/acronym boundaries — `"cardPAN"` and `"PANNumber"` both yield a `"pan"` token;
 * `"panelId"` does not. ASCII-boundary splitting by design: every token-boundary pattern is
 * itself plain ASCII, so a CJK or accented deny-list word matches as a whole-string substring
 * instead (which is what the substring list is for). */
function identifierTokens(name: string): string[] {
  return name
    .replace(/([a-z0-9])([A-Z])/g, "$1 $2")
    .replace(/([A-Z]+)([A-Z][a-z])/g, "$1 $2")
    .split(/[^a-zA-Z0-9]+/)
    .filter((token) => token.length > 0)
    .map((token) => canonical(token));
}

/**
 * Redacts values whose field name matches a case- and accent-insensitive substring deny-list.
 *
 * Substring (not exact) matching is deliberate — it catches `userPassword`, `cardCvv`,
 * `apiToken` — erring toward over-redaction, the safe default for a security control. The
 * default vocabulary is **multilingual and always on**: Spanish, Portuguese, French and Chinese
 * words sit beside the English ones, with no locale to select — names and patterns are both
 * folded through `canonical`, so `contraseña` and `contrasena` are one pattern. Teams tracing
 * fields that collide with a pattern override the set via {@link ofPatterns} or opt out with
 * {@link DISABLED}. Port of Java `render/RedactionPolicy`.
 */
export class RedactionPolicy {
  /** Marker emitted in place of a redacted value, matching the not-traced marker. */
  static readonly MARKER = "[REDACTED]";

  /** Secure default: redacts values for common sensitive field-name patterns (substring and
   * whole-identifier-token alike, multilingual) and by value shape. */
  static readonly DEFAULT = new RedactionPolicy(
    [...DEFAULT_PATTERNS, ...TOKEN_BOUNDARY_PATTERNS],
    true,
  );

  /** Opt-out policy that redacts nothing by name or value shape (annotations still apply). */
  static readonly DISABLED = new RedactionPolicy([], false);

  private readonly canonicalPatterns: readonly string[];
  private readonly valueShapesEnabled: boolean;

  private constructor(patterns: Iterable<string>, valueShapesEnabled: boolean) {
    this.canonicalPatterns = Array.from(patterns, (p) => canonical(p));
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

  /**
   * Whether a value should be redacted based on its field name. Every pattern is a case- and
   * accent-insensitive substring test except the {@link TOKEN_BOUNDARY_PATTERNS} (`pan`, `iban`,
   * `otp`, and eight non-English words), which match only a whole identifier token (`card_pan`,
   * `rutCliente`) or the whole field name (catching a run-together `IbAn` that token-splitting
   * alone would see as `ib` + `an`).
   */
  shouldRedact(fieldName: string | null | undefined): boolean {
    if (fieldName == null) return false;
    const canon = canonical(fieldName);
    let tokens: string[] | null = null;
    for (const pattern of this.canonicalPatterns) {
      if (!TOKEN_BOUNDARY_PATTERNS.has(pattern)) {
        if (canon.includes(pattern)) return true;
        continue;
      }
      if (canon === pattern) return true;
      tokens ??= identifierTokens(fieldName);
      if (tokens.includes(pattern)) return true;
    }
    return false;
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
