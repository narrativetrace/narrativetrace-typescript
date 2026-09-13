// SPDX-License-Identifier: BUSL-1.1
// Licensed under the Business Source License 1.1 (see LICENSE); Change Date: four years from publication; Change License: Apache-2.0
// Copyright (c) 2026 Empower Agile
import type { Finding, FindingStatus } from "./types.js";

/** A passing finding: no fix needed, by construction (see {@link Finding.fix}). */
export function pass(id: string, message: string, docUrl: string): Finding {
  return { id, status: "pass" as FindingStatus, message, fix: "", docUrl };
}

/** A failing finding: `fix` is mandatory — a fail with nothing to do about it is a wording bug. */
export function fail(id: string, message: string, fix: string, docUrl: string): Finding {
  return { id, status: "fail" as FindingStatus, message, fix, docUrl };
}
