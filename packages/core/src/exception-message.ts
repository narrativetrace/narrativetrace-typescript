// SPDX-License-Identifier: BUSL-1.1
// Licensed under the Business Source License 1.1 (see LICENSE); Change Date: four years from publication; Change License: Apache-2.0
// Copyright (c) 2026 Empower Agile
import { ControlEscape } from "./control-escape.js";
import { RedactionPolicy } from "./redaction-policy.js";

/** What an emitter says when the message could not be read at all. */
export const UNREADABLE = "<error>";

/**
 * The one reading of an exception's message every emitter shares.
 *
 * INTENT: a thrown value is held live in `TraceOutcome` (unlike a returned value, which is already
 * rendered text), so its message never passed the redaction policy: `new Error("bad token: eyJ…")`
 * reached every output in full while the identical string as a parameter answered `[REDACTED]`.
 * One accessor, called by every renderer and exporter, keeps them from drifting.
 *
 * @remarks Only the value-shape axis applies ({@link RedactionPolicy.shouldRedactValue}); the name
 * deny-list has nothing to match on in a message. Length is deliberately not capped. Reading the
 * message is application code (a getter, a `toString`) and is guarded: a message that cannot be
 * produced degrades to `<error>` instead of failing the emitter.
 */
export const ExceptionMessage = {
  /**
   * The message an emitter may print: the whole message replaced by the redaction marker when its
   * bytes are a credential, control-escaped otherwise, and `null` when the exception carries none.
   * `null` is kept apart from the text `"null"` so canonical exporters can omit an absent field.
   */
  of(error: unknown): string | null {
    let raw: unknown;
    try {
      raw = error instanceof Error ? error.message : String(error);
    } catch {
      return UNREADABLE;
    }
    if (raw === null || raw === undefined) return null;
    let text: string;
    try {
      text = typeof raw === "string" ? raw : String(raw);
    } catch {
      return UNREADABLE;
    }
    return RedactionPolicy.DEFAULT.shouldRedactValue(text)
      ? RedactionPolicy.MARKER
      : ControlEscape.sanitize(text);
  },

  /** {@link ExceptionMessage.of} where text is needed: a missing message prints as `null`. */
  text(error: unknown): string {
    return String(ExceptionMessage.of(error));
  },
} as const;
