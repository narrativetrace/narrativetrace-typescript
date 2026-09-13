// SPDX-License-Identifier: BUSL-1.1
// Licensed under the Business Source License 1.1 (see LICENSE); Change Date: four years from publication; Change License: Apache-2.0
// Copyright (c) 2026 Empower Agile
import type { CaptureShedding } from "./capture-shedding.js";

/**
 * Human phrasing of what a capture window lost, for approval-trace messages that must not read as
 * a behavioral change. `undefined` for a clean capture — the caller then compares by byte equality
 * instead of subsequence containment. Port of Java `NarrativeApproval.describe`.
 */
export function approvalLossNote(shedding: CaptureShedding | undefined): string | undefined {
  if (shedding === undefined) return undefined;
  const parts: string[] = [];
  if (shedding.shedEvents > 0) {
    parts.push(`${shedding.shedEvents} event${shedding.shedEvents === 1 ? "" : "s"} dropped`);
  }
  const refusedScopes = shedding.refusedScopes ?? 0;
  if (refusedScopes > 0) {
    parts.push(`${refusedScopes} async scope${refusedScopes === 1 ? "" : "s"} refused`);
  }
  return parts.length === 0 ? undefined : parts.join(", ");
}
