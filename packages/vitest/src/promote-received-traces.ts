// SPDX-License-Identifier: BUSL-1.1
// Licensed under the Business Source License 1.1 (see LICENSE); Change Date: four years from publication; Change License: Apache-2.0
// Copyright (c) 2026 Empower Agile
/**
 * Promotes reviewed `*.received.nt` traces to `*.approved.nt` baselines — the whole of "approving"
 * an approval trace: a received trace becomes the new committed contract. Port of Java
 * `output.NarrativeApproval#promoteReceived` (mirrored here rather than reused, so this package's
 * build stays free of a runtime dependency on the approval-evaluation module for what is otherwise
 * a pure filesystem sweep).
 */

/** Injected filesystem seam so the sweep is testable without a real filesystem. */
export interface PromoteIo {
  /** Every `*.received.nt` file under `root`, in no particular order; `[]` if `root` doesn't exist. */
  listReceivedTraces: (root: string) => readonly string[];
  rename: (from: string, to: string) => void;
}

/** `<name>.received.nt` → `<name>.approved.nt`. */
export function approvedPathOf(receivedPath: string): string {
  return receivedPath.replace(/\.received\.nt$/, ".approved.nt");
}

/**
 * Promotes every received trace under `root` to its approved sibling.
 *
 * @returns the approved paths written, in no guaranteed order; empty when there is nothing to
 * promote (including when `root` does not exist yet).
 */
export function promoteReceivedTraces(root: string, io: PromoteIo): string[] {
  return io.listReceivedTraces(root).map((received) => {
    const approved = approvedPathOf(received);
    io.rename(received, approved);
    return approved;
  });
}
