// SPDX-License-Identifier: BUSL-1.1
// Licensed under the Business Source License 1.1 (see LICENSE); Change Date: four years from publication; Change License: Apache-2.0
// Copyright (c) 2026 Empower Agile
/**
 * The on-disk naming scheme shared by every per-test artifact: the trace, the JSON export, the
 * diagram, the structural `.nt` artifact, and the committed approved trace beside them.
 *
 * INTENT: the family's naming scheme — every NarrativeTrace runtime mirrors this byte for byte, so
 * an artifact written by one runtime is found under the same name by another, and a name computed
 * once here never disagrees with a name computed by hand elsewhere. Port of Java
 * `output.OutputDirectoryResolver`.
 */

/**
 * The longest a single path element may be, in *bytes*.
 *
 * 255 is what ext4, XFS, APFS and NTFS all allow, and the number is bytes rather than characters on
 * every filesystem this library writes to except NTFS — which counts UTF-16 units and is therefore
 * never the tighter of the two for the names seen here. Counting characters would pass a
 * 200-character CJK name and then fail the write at 600 bytes.
 */
const MAX_COMPONENT_BYTES = 255;

/**
 * Bytes held back from a file slug for the suffix a writer appends to it. The longest in the
 * product is `.incomplete.nt` at 14; `.approved.nt` and `.received.nt` are 12, `.json` 5, `.md` 3.
 * 16 leaves room for one more without this constant having to change.
 */
const SUFFIX_RESERVE_BYTES = 16;

/**
 * Bytes an invocation label may occupy inside an artifact name. A display name is prose — a
 * parameterized test's name template interpolates arguments into it — so it is bounded before the
 * method slug is, and the index it follows is never the part that gets truncated. 60 leaves a long
 * name readable while keeping the whole element far below the component limit.
 */
const MAX_LABEL_BYTES = 60;

/**
 * Separates a method slug from its invocation discriminator. The slug alphabet is `[a-z0-9_]`, so a
 * hyphen can never appear inside either part: an ordinary method's artifact can never collide with
 * an invocation's, and a reader (or a manifest consumer) can split the name back into method, index
 * and label.
 */
const INVOCATION_SEPARATOR = "-";

/** UTF-8 bytes one code point costs (matching Java's `String#getBytes(UTF_8).length`). */
function utf8Width(codePoint: number): number {
  if (codePoint < 0x80) return 1;
  if (codePoint < 0x800) return 2;
  return codePoint < 0x10000 ? 3 : 4;
}

function utf8Length(value: string): number {
  let bytes = 0;
  for (const ch of value) bytes += utf8Width(ch.codePointAt(0) ?? 0);
  return bytes;
}

/** The longest prefix of `value` that encodes to at most `maxBytes`, cut on a code-point boundary. */
function truncateToUtf8Bytes(value: string, maxBytes: number): string {
  let bytes = 0;
  let text = "";
  for (const ch of value) {
    const width = utf8Width(ch.codePointAt(0) ?? 0);
    if (bytes + width > maxBytes) break;
    bytes += width;
    text += ch;
  }
  return text;
}

/**
 * `javaStringHashCode(value)` as eight lowercase hex digits — the family's one shared hash, chosen
 * because `String#hashCode` is *specified* (stable across JVMs, processes and runs), unlike a
 * per-process hash. `Math.imul` gives the exact 32-bit multiply Java's `int * int` performs.
 */
function javaStringHashCodeHex(value: string): string {
  let hash = 0;
  for (let i = 0; i < value.length; i++) {
    hash = (Math.imul(hash, 31) + value.charCodeAt(i)) | 0;
  }
  return (hash >>> 0).toString(16).padStart(8, "0");
}

/**
 * The slug, shortened to fit a path element when it does not.
 *
 * INTENT: truncation alone is a silent overwrite — two long names sharing a prefix would land on
 * one artifact, and one scenario's approved trace would then judge another's. The truncated form
 * keeps eight hex characters of the full slug's hash so two names differing only past the cut still
 * resolve to different artifacts; nothing under the limit is touched, so no existing artifact — or
 * approved trace beside it — moves.
 */
function capped(slug: string, maxBytes: number): string {
  if (utf8Length(slug) <= maxBytes) return slug;
  const suffix = `_${javaStringHashCodeHex(slug)}`;
  return truncateToUtf8Bytes(slug, maxBytes - suffix.length) + suffix;
}

/**
 * Everything a path cannot carry, replaced: separators (which would write outside the directory)
 * and control characters/lone surrogates (which a filesystem call would reject). Nothing else — a
 * class or module name keeps its own spelling, unicode letters included.
 *
 * @returns the safe directory segment; `"unnamed"` when nothing legible survives.
 */
export function toDirectorySlug(simpleName: string): string {
  let slug = "";
  for (const ch of simpleName) {
    slug += isPathSafe(ch) ? ch : "_";
  }
  const named = slug === "" || [...slug].every((ch) => ch === ".") ? "unnamed" : slug;
  return capped(named, MAX_COMPONENT_BYTES);
}

function isPathSafe(ch: string): boolean {
  const code = ch.codePointAt(0) ?? 0;
  const isIsoControl = code <= 0x1f || (code >= 0x7f && code <= 0x9f);
  const isLoneSurrogate = ch.length === 1 && code >= 0xd800 && code <= 0xdfff;
  return !isIsoControl && !isLoneSurrogate && ch !== "/" && ch !== "\\";
}

/** The uncapped slug: camel-case split, lowercased, everything outside the alphabet replaced. */
function rawFileSlug(name: string): string {
  const split = name.replace(/([a-z])([A-Z])/g, "$1_$2").toLowerCase();
  return split.replace(/[^a-z0-9_]/g, "_");
}

/** One slug rule for every per-test artifact: `customerPlacesOrder` → `customer_places_order`. */
export function toFileSlug(methodName: string): string {
  return capped(rawFileSlug(methodName), MAX_COMPONENT_BYTES - SUFFIX_RESERVE_BYTES);
}

/**
 * A display name reduced to a readable name fragment: the shared slug rule, then runs of `_`
 * collapsed and the ends trimmed, so a default label like `[1] KAYAK` reads as `1_kayak` rather than
 * `_1__kayak`. A label that slugs to nothing is dropped entirely — the index alone still names the
 * invocation.
 */
function labelSlug(invocationLabel: string): string {
  const collapsed = rawFileSlug(invocationLabel).replace(/_+/g, "_");
  const trimmed = collapsed.replace(/^_+/, "").replace(/_+$/, "");
  return capped(trimmed, MAX_LABEL_BYTES);
}

/** `-002-find_tent`: the index a reader navigates by, then the label they recognize. */
function invocationTail(invocationIndex: number, invocationLabel: string): string {
  const index = `${INVOCATION_SEPARATOR}${String(invocationIndex).padStart(3, "0")}`;
  const label = labelSlug(invocationLabel);
  return label === "" ? index : `${index}${INVOCATION_SEPARATOR}${label}`;
}

/**
 * The artifact base name for one invocation of a test method.
 *
 * An index of zero means "this method runs once", which is every ordinary test, and returns exactly
 * what {@link toFileSlug} always returns: no existing artifact — or approved trace beside it —
 * moves. Otherwise the discriminator is appended and the *method* half absorbs any shortening, so
 * the index a reader navigates by is never the part truncated away.
 *
 * @param invocationIndex 1-based invocation number, or `0` for a method that runs once.
 * @param invocationLabel the invocation's display name; may be blank.
 */
export function toInvocationFileSlug(
  methodName: string,
  invocationIndex: number,
  invocationLabel: string,
): string {
  if (invocationIndex <= 0) return toFileSlug(methodName);
  const tail = invocationTail(invocationIndex, invocationLabel);
  const budget = MAX_COMPONENT_BYTES - SUFFIX_RESERVE_BYTES - utf8Length(tail);
  return capped(rawFileSlug(methodName), budget) + tail;
}

/** The last dot-separated segment, which is a class/module name only when the caller passed one. */
export function simpleNameOf(qualifiedName: string): string {
  const lastDot = qualifiedName.lastIndexOf(".");
  return lastDot < 0 ? qualifiedName : qualifiedName.slice(lastDot + 1);
}
