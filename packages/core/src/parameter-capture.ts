// SPDX-License-Identifier: BUSL-1.1
// Licensed under the Business Source License 1.1 (see LICENSE); Change Date: four years from publication; Change License: Apache-2.0
// Copyright (c) 2026 Empower Agile
import { RedactionPolicy } from "./redaction-policy.js";
import type { RenderedValue } from "./rendered-value.js";

/**
 * A single captured method argument, frozen at call time into a render-ready form.
 *
 * INTENT: decouples display from the live value — `renderedValue` is the already-stringified form
 * and `redacted` flags secrets. Callers must never print `renderedValue` directly for redacted
 * params; route through {@link displayParamValue} instead.
 */
export interface ParameterCapture {
  readonly name: string;
  readonly renderedValue: string;
  /**
   * `true` iff the parameter's WHOLE value was withheld — by name (the deny-list or an explicit
   * `@notTraced`/`static notTraced`/config `notTraced` index), or because the TOP-LEVEL value's
   * own shape matched (JWT, Luhn PAN, `Set-Cookie`, a national-id checksum) and the entire
   * rendering is the `[REDACTED]` marker. A shape match on a NESTED leaf — a JWT inside an
   * object's field, a PAN inside an array item — masks that leaf in the rendered text
   * ({@link renderValue}) exactly the same way, but does NOT set this flag: the flag is
   * per-parameter, shape matches are per-leaf, and a parameter carrying one redacted field among
   * several visible ones has not had its whole value withheld. (Family-wide ruling, 2026-09-10 —
   * see `renderCapture` in `value-renderer.ts`, the seam both capture paths use to learn the
   * top-level decision without inferring it from the rendered string.)
   */
  readonly redacted: boolean;
  /** Optional typed structured form, for exporters that emit typed attributes (TW8 OTel). */
  readonly structured?: RenderedValue;
}

/**
 * Builds a frozen {@link ParameterCapture}.
 *
 * @param name the parameter's display name.
 * @param renderedValue the pre-stringified argument value shown in output.
 * @param redacted when `true`, renderers must substitute the redaction marker (see {@link displayParamValue}).
 * @param structured optional typed form for typed-attribute exporters; omitted when absent.
 */
export function parameterCapture(
  name: string,
  renderedValue: string,
  redacted: boolean,
  structured?: RenderedValue,
): ParameterCapture {
  return Object.freeze({ name, renderedValue, redacted, ...(structured && { structured }) });
}

/**
 * Defense-in-depth: a capture flagged `redacted` always displays the canonical marker,
 * regardless of the value that happens to be in `renderedValue`. Every renderer and export
 * path funnels param display through here so a redacted secret cannot leak (parallel-path
 * rule from Java's per-renderer `param.redacted()` re-check).
 */
export function displayParamValue(capture: ParameterCapture): string {
  return capture.redacted ? RedactionPolicy.MARKER : capture.renderedValue;
}
