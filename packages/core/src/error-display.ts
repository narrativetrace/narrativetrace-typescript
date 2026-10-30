// SPDX-License-Identifier: BUSL-1.1
// Licensed under the Business Source License 1.1 (see LICENSE); Change Date: four years from publication; Change License: Apache-2.0
// Copyright (c) 2026 Empower Agile
import { ControlEscape } from "./control-escape.js";
import { ExceptionMessage } from "./exception-message.js";

/**
 * The exception's type name for display — the constructor name for Error instances and other
 * objects, or the primitive typeof for thrown non-objects (the closest analog of the simple type
 * name that every runtime reports). Renderers must show this; it was previously dropped everywhere.
 *
 * @remarks Control-sanitized like {@link errorMessage}: `Function.prototype.name` is a writable
 * string property, not restricted to identifier syntax, so a class whose `name` was reassigned (or
 * a trace re-hydrated from external data) can carry hostile bytes here just as readily as in a
 * message.
 */
export function errorTypeName(error: unknown): string {
  return ControlEscape.sanitize(rawErrorTypeName(error));
}

function rawErrorTypeName(error: unknown): string {
  if (error instanceof Error) return error.constructor?.name || "Error";
  if (typeof error === "object" && error !== null) return error.constructor?.name || "Object";
  return typeof error;
}

/**
 * The exception message for display: redacted when it is credential-shaped, control-sanitized
 * otherwise. Kept as the public name; it is {@link ExceptionMessage.text}, the one filtered reading
 * every emitter shares, so an external caller cannot print the unfiltered message by accident.
 */
export function errorMessage(error: unknown): string {
  return ExceptionMessage.text(error);
}
