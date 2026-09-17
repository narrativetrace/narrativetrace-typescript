// SPDX-License-Identifier: BUSL-1.1
// Licensed under the Business Source License 1.1 (see LICENSE); Change Date: four years from publication; Change License: Apache-2.0
// Copyright (c) 2026 Empower Agile
// The worker-pool size every package's `stryker.config.mjs` runs Stryker with.
//
// 2026-09-17 Linux nightly finding F3 (family-wide, mirrored from mutmut's `--max-children`):
// mutation runners size their worker pools from the HOST's core count. Inside a cgroup-quota'd
// container that oversubscribes — three concurrent runs on one 8-core VM each claimed all eight
// cores, and the runs then interfered with each other's timing-sensitive tests.
//
// Order of precedence:
//   1. `NT_MUTATION_WORKERS` — an explicit positive integer from the caller (the Pro nightly
//      passes `NT_MUTATION_WORKERS=4`). Set but not a positive integer is an error, never a
//      silent fallback: a typo'd budget must not read as "use the whole host".
//   2. `/sys/fs/cgroup/cpu.max` — cgroup v2's `"<quota> <period>"`, so `"400000 100000"` is a
//      4-CPU quota -> 4 workers (rounded UP, floored at 1, so a fractional quota still runs).
//   3. The runtime's CPU count — reached only when the quota reads `max`, the file is absent
//      (macOS, a bare host, cgroup v1), or its content does not parse. Never a bare host-core
//      count on a quota'd host, which is the whole point of step 2.
//
// Plain ESM (not TypeScript): Stryker's config reader imports `stryker.config.mjs` directly with
// plain Node, with no tsx/ts-node loader in that process — a `.ts` module here would not resolve.
// Tested the same way as `packages/*/src` via `tools/__tests__/mutation-workers.test.ts`.

import { readFileSync } from "node:fs";
import { cpus } from "node:os";

export const WORKERS_ENV_VAR = "NT_MUTATION_WORKERS";
export const CGROUP_CPU_MAX_PATH = "/sys/fs/cgroup/cpu.max";

/** A validated `NT_MUTATION_WORKERS` value, never a silent fallback on a typo'd budget. */
export function explicitCount(raw) {
  const count = Number(raw.trim());
  if (!Number.isInteger(count) || count < 1) {
    throw new Error(`${WORKERS_ENV_VAR} must be a positive integer, got ${JSON.stringify(raw)}`);
  }
  return count;
}

/** Workers from a cgroup v2 `cpu.max` line, or `undefined` when it sets no limit or doesn't parse. */
export function quotaCount(cgroupCpuMax) {
  const fields = cgroupCpuMax.trim().split(/\s+/);
  if (fields.length !== 2 || fields[0] === "max") return undefined;
  const quota = Number(fields[0]);
  const period = Number(fields[1]);
  if (!Number.isInteger(quota) || !Number.isInteger(period) || quota < 1 || period < 1) {
    return undefined;
  }
  return Math.max(1, Math.ceil(quota / period));
}

/** The number of mutation workers for this machine. Pure — every input is passed in. */
export function workerCount(env, cgroupCpuMax, hostCpuCount) {
  const explicit = (env[WORKERS_ENV_VAR] ?? "").trim();
  if (explicit) return explicitCount(explicit);
  const fromQuota = cgroupCpuMax == null ? undefined : quotaCount(cgroupCpuMax);
  if (fromQuota !== undefined) return fromQuota;
  return Math.max(1, hostCpuCount || 1);
}

/** Which input decided {@link workerCount}'s result, for the announcement line. */
export function workerCountSource(env, cgroupCpuMax) {
  if ((env[WORKERS_ENV_VAR] ?? "").trim()) return WORKERS_ENV_VAR;
  if (cgroupCpuMax != null && quotaCount(cgroupCpuMax) !== undefined) return "cgroup cpu.max quota";
  return "runtime CPU count";
}

/**
 * This machine's cgroup v2 `cpu.max` line, or `undefined` where the file is absent or unreadable
 * (macOS, a bare host, cgroup v1). Exported because `turbo-run.mjs` derives the gate's
 * package-level concurrency from the same line, through the same {@link workerCount}.
 */
export function readCgroupCpuMax(path = CGROUP_CPU_MAX_PATH) {
  try {
    return readFileSync(path, "utf8");
  } catch {
    return undefined;
  }
}

/** {@link workerCount} against this process's real environment. */
export function resolveWorkerCount(cgroupPath = CGROUP_CPU_MAX_PATH) {
  return workerCount(process.env, readCgroupCpuMax(cgroupPath), cpus().length);
}

/**
 * The `concurrency` value a package's `stryker.config.mjs` assigns, announced once at config-load
 * time so a scoped `stryker run` shows which worker count and source it used.
 */
export function resolveStrykerConcurrency(packageName, cgroupPath = CGROUP_CPU_MAX_PATH) {
  const cgroupCpuMax = readCgroupCpuMax(cgroupPath);
  const workers = workerCount(process.env, cgroupCpuMax, cpus().length);
  const source = workerCountSource(process.env, cgroupCpuMax);
  console.log(
    `mutation-workers[${packageName}]: running Stryker with concurrency ${workers} (from ${source})`,
  );
  return workers;
}
