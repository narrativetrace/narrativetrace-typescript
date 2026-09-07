// SPDX-License-Identifier: BUSL-1.1
// Licensed under the Business Source License 1.1 (see LICENSE); Change Date: four years from publication; Change License: Apache-2.0
// Copyright (c) 2026 Empower Agile
/** The pipeline/consumer surface the auto-flush hook drains on shutdown. */
export interface Drainable {
  flush(): void;
  close(): void;
}

/** Minimal subset of NodeJS.Process the hook needs (injectable for tests). */
export interface LifecycleEmitter {
  once(event: string, handler: () => void): void;
  off?(event: string, handler: () => void): void;
}

const SHUTDOWN_EVENTS = ["beforeExit", "SIGTERM"] as const;

/**
 * Drains and closes a pipeline/consumer on graceful Node shutdown so buffered-but-undrained tail
 * events are not lost (Java's shutdown hook → close() → drainRemaining). The flush+close runs at
 * most once regardless of which signal fires or whether close() was already called explicitly
 * (target.close() must itself be idempotent). Returns a disposer that removes the listeners.
 */
export function registerAutoFlush(target: Drainable, proc: LifecycleEmitter = process): () => void {
  let done = false;
  const handler = (): void => {
    if (done) return;
    done = true;
    try {
      target.flush();
    } finally {
      target.close();
    }
  };
  for (const event of SHUTDOWN_EVENTS) proc.once(event, handler);
  return () => {
    for (const event of SHUTDOWN_EVENTS) proc.off?.(event, handler);
  };
}
