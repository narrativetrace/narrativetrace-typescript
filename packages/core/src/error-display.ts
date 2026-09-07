// SPDX-License-Identifier: BUSL-1.1
// Licensed under the Business Source License 1.1 (see LICENSE); Change Date: four years from publication; Change License: Apache-2.0
// Copyright (c) 2026 Empower Agile
import { ControlEscape } from "./control-escape.js";

/**
 * The exception's type name for display — the constructor name for Error instances and other
 * objects, or the primitive typeof for thrown non-objects (Java uses getSimpleName; this is the
 * closest cross-runtime analog). Renderers must show this; it was previously dropped everywhere.
 *
 * @remarks Control-sanitized like {@link errorMessage}: `Function.prototype.name` is a writable
 * string property, not restricted to identifier syntax, so a class whose `name` was reassigned (or
 * a trace re-hydrated from external data) can carry hostile bytes here just as readily as in a
 * message (cross-runtime shape F4, 2026-09-02 audit).
 */
export function errorTypeName(error: unknown): string {
  return ControlEscape.sanitize(rawErrorTypeName(error));
}

function rawErrorTypeName(error: unknown): string {
  if (error instanceof Error) return error.constructor?.name || "Error";
  if (typeof error === "object" && error !== null) return error.constructor?.name || "Object";
  return typeof error;
}

/** The exception message, control-sanitized to prevent log-forging / output injection. */
export function errorMessage(error: unknown): string {
  const raw = error instanceof Error ? error.message : String(error);
  return ControlEscape.sanitize(raw);
}
