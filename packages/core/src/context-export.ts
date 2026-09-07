// SPDX-License-Identifier: BUSL-1.1
// Licensed under the Business Source License 1.1 (see LICENSE); Change Date: four years from publication; Change License: Apache-2.0
// Copyright (c) 2026 Empower Agile
import { ControlEscape } from "./control-escape.js";

/**
 * Upper bound on an exported context value's length, applied after escaping. Bounds cardinality
 * and storage cost in whatever log/telemetry sink receives it — an unbounded HTTP route or header
 * value is as much a sink-side DoS as an unescaped one is a log-forging vector.
 */
const MAX_LENGTH = 256;

/**
 * Normalizes a request-derived value (HTTP method/route, client IP, end-user/session/tenant id)
 * before it reaches a logging MDC-equivalent or a telemetry attribute: control-escapes so a raw
 * newline or control character cannot forge a log line or a directive, then caps length.
 *
 * INTENT: an *export* concern, not a capture one — the raw value stays in the trace model (ADR-002:
 * capture faithful, project last) and is normalized only where a sink's own rules require it. Escaping
 * runs before capping so a multi-character mnemonic escape (`\n` → `\\n`) cannot be cut in half
 * exactly at the length boundary. Port of Java `ai.narrativetrace.core.context.ContextExport`
 * (cross-runtime shape F6, 2026-09-02 audit).
 */
export const ContextExport = {
  sanitize(value: string): string {
    const escaped = ControlEscape.sanitize(value);
    return escaped.length > MAX_LENGTH ? `${escaped.slice(0, MAX_LENGTH)}…` : escaped;
  },
};
