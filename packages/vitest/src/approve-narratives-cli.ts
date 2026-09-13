// SPDX-License-Identifier: BUSL-1.1
// Licensed under the Business Source License 1.1 (see LICENSE); Change Date: four years from publication; Change License: Apache-2.0
// Copyright (c) 2026 Empower Agile
import { type Dirent, readdirSync, renameSync } from "node:fs";
import { join } from "node:path";
import { type PromoteIo, promoteReceivedTraces } from "./promote-received-traces.js";

const RECEIVED_SUFFIX = ".received.nt";

/** Explicit-stack (non-recursive) directory walk collecting every `*.received.nt` path. */
function listReceivedTraces(root: string): string[] {
  const found: string[] = [];
  const stack = [root];
  while (stack.length > 0) {
    const dir = stack.pop() as string;
    for (const entry of readEntries(dir)) {
      const full = join(dir, entry.name);
      if (entry.isDirectory()) stack.push(full);
      else if (entry.name.endsWith(RECEIVED_SUFFIX)) found.push(full);
    }
  }
  return found;
}

/** A missing directory (no traces promoted yet) reads as empty, never an error. */
function readEntries(dir: string): Dirent[] {
  try {
    return readdirSync(dir, { withFileTypes: true });
  } catch {
    return [];
  }
}

export interface ApproveNarrativesIo {
  log: (message: string) => void;
}

/**
 * Runs the approve verb: promotes every `*.received.nt` under `root` to its approved trace. The
 * `narrativetrace-approve` bin's implementation, injectable for testing.
 */
export function runApproveNarratives(
  root: string,
  io: ApproveNarrativesIo = { log: console.log },
): void {
  const promoteIo: PromoteIo = { listReceivedTraces, rename: renameSync };
  const promoted = promoteReceivedTraces(root, promoteIo);
  if (promoted.length === 0) {
    io.log("No received traces to approve.");
    return;
  }
  for (const path of promoted) io.log(`Approved: ${path}`);
}
