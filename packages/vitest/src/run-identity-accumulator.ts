// SPDX-License-Identifier: BUSL-1.1
// Licensed under the Business Source License 1.1 (see LICENSE); Change Date: four years from publication; Change License: Apache-2.0
// Copyright (c) 2026 Empower Agile
import {
  generateTraceId,
  humanName,
  isValidTraceId,
  type RunIdentity,
} from "@narrativetrace/core-node";

/**
 * The environment variable a Vitest orchestrator process (a reporter's `onInit`, or a
 * `globalSetup` module) hands down to every worker it spawns, so one W3C-shaped id names the
 * WHOLE Vitest run regardless of how many worker threads/processes execute its test files
 * (2026-09-13 ruling, item 2). Node's `worker_threads`/`child_process` pools both snapshot
 * `process.env` at worker creation, so setting this before any worker starts — the earliest a
 * reporter or `globalSetup` can run — is enough for every worker to inherit the same value.
 */
const RUN_ID_ENV = "NARRATIVETRACE_RUN_ID";

let cached: RunIdentity | undefined;

function identityFromId(id: string): RunIdentity {
  return { id, name: humanName(id as Parameters<typeof humanName>[0]) };
}

/**
 * This process's run identity for the whole Vitest execution — generated once, the first time
 * anything asks (Java parity: `NarrativeTraceExtension`'s per-accumulator `RunIdentity`, generated
 * exactly once). When {@link RUN_ID_ENV} is already set — a worker inheriting it from the
 * orchestrator process that generated it first — that id names the run instead of a fresh one, so
 * every worker in one Vitest invocation shares one run name.
 *
 * @remarks A process that never calls this (or whose orchestrator never wired
 * {@link narrativeTraceGlobalSetup} / a reporter using this module) is not "outside a tracked run"
 * the way a bare `main()` is in the reference runtime — each worker still gets ITS OWN identity, a
 * documented adaptation forced by Vitest's worker-pool model (no process-wide singleton reaches
 * every worker without an explicit handoff). Wire {@link narrativeTraceGlobalSetup} for one name
 * across the whole run; without it, artifacts within one worker still agree, across workers they
 * may not.
 */
export function runIdentity(): RunIdentity {
  if (cached) return cached;
  const fromEnv = process.env[RUN_ID_ENV];
  if (fromEnv !== undefined && isValidTraceId(fromEnv)) {
    cached = identityFromId(fromEnv);
    return cached;
  }
  const id = generateTraceId();
  process.env[RUN_ID_ENV] = id;
  cached = identityFromId(id);
  return cached;
}

/**
 * Vitest `globalSetup` export: call {@link runIdentity} in the main orchestrator process, before
 * any worker spawns, so {@link RUN_ID_ENV} is set in time for every worker to inherit it. Wire it
 * into `vitest.config.ts`'s `globalSetup: ["@narrativetrace/vitest/global-setup"]` for one run name
 * shared by every test file in a multi-worker-process (`pool: "forks"`) run.
 */
export default function narrativeTraceGlobalSetup(): void {
  runIdentity();
}

/**
 * Test-only: clears the cached identity and the environment handoff, so the next call to
 * {@link runIdentity} generates a fresh one — mirrors Java's package-visible
 * `resetGlobalAccumulator` reset hook, used so a test can prove two runs get two different names.
 */
export function resetRunIdentityForTest(): void {
  cached = undefined;
  delete process.env[RUN_ID_ENV];
}
