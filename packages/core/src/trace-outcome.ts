// SPDX-License-Identifier: BUSL-1.1
// Licensed under the Business Source License 1.1 (see LICENSE); Change Date: four years from publication; Change License: Apache-2.0
// Copyright (c) 2026 Empower Agile
import type { RenderedValue } from "./rendered-value.js";

/**
 * A method that completed normally by returning a value.
 *
 * INTENT: the "success" arm of {@link TraceOutcome}. `renderedValue` is the display string a
 * renderer prints; `null` means the method returned `void`/`undefined` or the value was suppressed.
 */
export interface Returned {
  readonly kind: "returned";
  readonly renderedValue: string | null;
  /** Optional typed structured form of the return value (TW8 OTel typed attributes). */
  readonly structured?: RenderedValue;
}

/**
 * A method that terminated by throwing.
 *
 * INTENT: the "failure" arm of {@link TraceOutcome}. `error` is the raw thrown value (any type,
 * not just `Error`); `errorContext` is the resolved `@onError` narration for that thrown type, or
 * `null` when no handler matched.
 */
export interface Threw {
  readonly kind: "threw";
  readonly error: unknown;
  /** Resolved @onError context for the thrown type, or null when none matched. */
  readonly errorContext: string | null;
}

/**
 * A method whose outcome was never recorded — capture stopped mid-flight (e.g. a pending async
 * call, or the trace was cut off before the exit event arrived).
 */
export interface Incomplete {
  readonly kind: "incomplete";
}

/**
 * The terminal result of a single traced call, discriminated by `kind`.
 *
 * INTENT: the outcome half of a {@link TraceNode}; renderers switch on `kind` to decide how to
 * print the exit line (returned value, error, or an unfinished call).
 */
export type TraceOutcome = Returned | Threw | Incomplete;

/**
 * Builds a frozen {@link Returned} outcome for a normally-completed call.
 *
 * @param renderedValue display string for the return value; `null` for void/suppressed returns.
 * @param structured optional typed form for exporters that emit typed attributes; omitted when absent.
 */
export function returned(renderedValue: string | null, structured?: RenderedValue): Returned {
  return Object.freeze({
    kind: "returned" as const,
    renderedValue,
    ...(structured && { structured }),
  });
}

/**
 * Builds a frozen {@link Threw} outcome for a call that raised.
 *
 * @param error the raw thrown value, preserved as-is (may be any type, not only `Error`).
 * @param errorContext resolved `@onError` narration for the thrown type; defaults to `null` (no match).
 */
export function threw(error: unknown, errorContext: string | null = null): Threw {
  return Object.freeze({ kind: "threw" as const, error, errorContext });
}

const INCOMPLETE: Incomplete = Object.freeze({ kind: "incomplete" as const });

/**
 * Returns the shared frozen {@link Incomplete} outcome.
 *
 * @remarks A singleton — every incomplete call refers to the same immutable instance.
 */
export function incomplete(): Incomplete {
  return INCOMPLETE;
}
