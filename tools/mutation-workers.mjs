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
// The CPU-derived count, in order of precedence:
//   1. `NT_MUTATION_WORKERS` — an explicit positive integer from the caller (the Pro nightly
//      passes `NT_MUTATION_WORKERS=4`). Set but not a positive integer is an error, never a
//      silent fallback: a typo'd budget must not read as "use the whole host".
//   2. `/sys/fs/cgroup/cpu.max` — cgroup v2's `"<quota> <period>"`, so `"400000 100000"` is a
//      4-CPU quota -> 4 workers (rounded UP, floored at 1, so a fractional quota still runs).
//   3. The runtime's CPU count — reached only when the quota reads `max`, the file is absent
//      (macOS, a bare host, cgroup v1), or its content does not parse. Never a bare host-core
//      count on a quota'd host, which is the whole point of step 2.
//
// 2026-09-18 finding: that CPU-derived count ignores memory. A container can have no CPU quota
// (`cpu.max` = `max`) while still carrying a memory ceiling (`/sys/fs/cgroup/memory.max`) — the
// nightly's 8-core, 3 GB container hit exactly this: "runtime CPU count" picked 8 workers, each
// spawning a Vitest runner, and the kernel OOM-killed the run (exit 137) well before all eight
// were even scheduled. So the final count is the MINIMUM of the CPU-derived count above and a
// memory-derived bound: `floor(memory.max / 700 MiB)`, floored at 1. 700 MiB is the measured
// per-runner peak anon-rss from the 2026-09-17 dmesg trace (range observed: 0.35–1.48 GB) — a
// measured figure, not a chosen round number. `memory.max` reading `max` (no ceiling) or being
// absent (macOS, a bare host, cgroup v1) applies no memory bound at all.
//
// 2026-10-28 finding (B-219): the worker count bounds how many runners exist, not how large one
// grows. Each runner's isolates defaulted to a heap limit of about half the HOST's memory, so one
// runaway mutant reached 1.78 GB by itself and the container's OOM killer SIGKILLed runners in the
// nightly. Each runner therefore also gets `--max-old-space-size` at its share of the ceiling —
// `memory.max / (workers + 1)`, floored at 512 MiB, the rule B-218 lands for the Python port — so a
// runaway fails alone instead. See `runnerHeapLimitMb`.
//
// Plain ESM (not TypeScript): Stryker's config reader imports `stryker.config.mjs` directly with
// plain Node, with no tsx/ts-node loader in that process — a `.ts` module here would not resolve.
// Tested the same way as `packages/*/src` via `tools/__tests__/mutation-workers.test.ts`.

import { readFileSync } from "node:fs";
import { cpus } from "node:os";

export const WORKERS_ENV_VAR = "NT_MUTATION_WORKERS";
export const CGROUP_CPU_MAX_PATH = "/sys/fs/cgroup/cpu.max";
export const CGROUP_MEMORY_MAX_PATH = "/sys/fs/cgroup/memory.max";

/** Measured per-runner peak anon-rss (2026-09-17 dmesg trace, range 0.35–1.48 GB) — not a chosen round number. */
export const MEASURED_PEAK_RUNNER_BYTES = 700 * 1024 * 1024;

const MIB = 1024 * 1024;

/**
 * The least heap a test runner is ever capped at, however many share the ceiling: the floor B-218
 * measured for the Python runners (300 MB starved the clean run there). The clean `core` suite
 * passes in one Vitest thread at 512 MiB (B-219).
 */
export const MIN_RUNNER_HEAP_BYTES = 512 * MIB;

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

/** The CPU-derived count alone — {@link WORKERS_ENV_VAR} > cgroup CPU quota > runtime CPU count. */
function cpuDerivedCount(env, cgroupCpuMax, hostCpuCount) {
  const explicit = (env[WORKERS_ENV_VAR] ?? "").trim();
  if (explicit) return explicitCount(explicit);
  const fromQuota = cgroupCpuMax == null ? undefined : quotaCount(cgroupCpuMax);
  if (fromQuota !== undefined) return fromQuota;
  return Math.max(1, hostCpuCount || 1);
}

/**
 * Workers from a cgroup v2 `memory.max` line, or `undefined` when it sets no ceiling or doesn't
 * parse. `floor(bytes / MEASURED_PEAK_RUNNER_BYTES)`, floored at 1 so the pool is never empty.
 */
export function memoryCount(cgroupMemoryMax) {
  const bytes = ceilingBytes(cgroupMemoryMax);
  return bytes === undefined
    ? undefined
    : Math.max(1, Math.floor(bytes / MEASURED_PEAK_RUNNER_BYTES));
}

/** The ceiling in bytes from a cgroup v2 `memory.max` line, or `undefined` for none/unparsable. */
function ceilingBytes(cgroupMemoryMax) {
  const trimmed = (cgroupMemoryMax ?? "").trim();
  if (trimmed === "max") return undefined;
  const bytes = Number(trimmed);
  if (!Number.isInteger(bytes) || bytes < 1) return undefined;
  return bytes;
}

/**
 * The number of mutation workers for this machine. Pure — every input is passed in. The
 * CPU-derived count ({@link WORKERS_ENV_VAR} > cgroup CPU quota > runtime CPU count), capped by
 * the memory-derived count when `cgroupMemoryMax` sets a ceiling — the minimum of the two, so an
 * explicit budget or a generous CPU quota still can't out-schedule the container's memory.
 */
export function workerCount(env, cgroupCpuMax, hostCpuCount, cgroupMemoryMax) {
  const cpuDerived = cpuDerivedCount(env, cgroupCpuMax, hostCpuCount);
  const memDerived = cgroupMemoryMax == null ? undefined : memoryCount(cgroupMemoryMax);
  return memDerived === undefined ? cpuDerived : Math.min(cpuDerived, memDerived);
}

/** Which input decided {@link workerCount}'s result, for the announcement line. */
export function workerCountSource(env, cgroupCpuMax, hostCpuCount, cgroupMemoryMax) {
  const cpuSource = (env[WORKERS_ENV_VAR] ?? "").trim()
    ? WORKERS_ENV_VAR
    : cgroupCpuMax != null && quotaCount(cgroupCpuMax) !== undefined
      ? "cgroup cpu.max quota"
      : "runtime CPU count";
  const memDerived = cgroupMemoryMax == null ? undefined : memoryCount(cgroupMemoryMax);
  if (memDerived === undefined) return cpuSource;
  const cpuDerived = cpuDerivedCount(env, cgroupCpuMax, hostCpuCount);
  return memDerived < cpuDerived ? "cgroup memory.max ceiling" : cpuSource;
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

/**
 * This machine's cgroup v2 `memory.max` line, or `undefined` where the file is absent or
 * unreadable (macOS, a bare host, cgroup v1). Exported for the same reason
 * {@link readCgroupCpuMax} is — `turbo-run.mjs` derives the gate's package-level concurrency from
 * the same line, through the same {@link workerCount}.
 */
export function readCgroupMemoryMax(path = CGROUP_MEMORY_MAX_PATH) {
  try {
    return readFileSync(path, "utf8");
  } catch {
    return undefined;
  }
}

/** {@link workerCount} against this process's real environment. */
export function resolveWorkerCount(
  cgroupCpuPath = CGROUP_CPU_MAX_PATH,
  cgroupMemoryPath = CGROUP_MEMORY_MAX_PATH,
) {
  return workerCount(
    process.env,
    readCgroupCpuMax(cgroupCpuPath),
    cpus().length,
    readCgroupMemoryMax(cgroupMemoryPath),
  );
}

/**
 * The heap cap, in MiB, for one Stryker test-runner process: the container's memory ceiling split
 * over the `workers` runners plus Stryker's own parent process, floored at
 * {@link MIN_RUNNER_HEAP_BYTES} — the rule B-218 lands for the Python port's `RLIMIT_DATA`.
 * `undefined` where `cgroupMemoryMax` sets no ceiling (`max`, absent, unparsable): there is nothing
 * to share, and Node's own default applies.
 *
 * Why a cap at all (B-219): without one, every runner's isolates default to a heap limit of about
 * half the host's memory (1.58 GB on the 7.75 GB VM), so one runaway mutant — a renderer walk that
 * never stops on a cyclic tree, its indentation growing with the depth — reached 1.78 GB alone,
 * and the kernel's OOM killer, not the mutant, ended runs inside the 3 GiB nightly container. With
 * the cap that runner's worker thread fails alone (`ERR_WORKER_OUT_OF_MEMORY`) and the rest of the
 * pool keeps running.
 *
 * @throws {RangeError} when `workers` is not a positive integer.
 */
export function runnerHeapLimitMb(workers, cgroupMemoryMax) {
  if (!Number.isInteger(workers) || workers < 1) {
    throw new RangeError(`workers must be a positive integer, got ${workers}`);
  }
  const ceiling = ceilingBytes(cgroupMemoryMax);
  if (ceiling === undefined) return undefined;
  const share = Math.max(ceiling / (workers + 1), MIN_RUNNER_HEAP_BYTES);
  return Math.floor(share / MIB);
}

/**
 * The Node flags every Stryker test-runner process starts with (Stryker's `testRunnerNodeArgs`,
 * which reaches the runner processes only — never Stryker's own): `--max-old-space-size` at
 * {@link runnerHeapLimitMb}, or none where the container sets no memory ceiling. V8 applies the
 * flag to every isolate in the process, so it bounds the Vitest worker thread the tests run in.
 */
export function testRunnerNodeArgs(workers, cgroupMemoryMax) {
  const heapMb = runnerHeapLimitMb(workers, cgroupMemoryMax);
  return heapMb === undefined ? [] : [`--max-old-space-size=${heapMb}`];
}

/**
 * The resource options a package's `stryker.config.mjs` spreads in — `concurrency` from
 * {@link workerCount} and `testRunnerNodeArgs` sized for that many runners — announced once at
 * config-load time so a scoped `stryker run` shows the worker count, its source and the heap cap.
 */
export function resolveStrykerOptions(
  packageName,
  cgroupCpuPath = CGROUP_CPU_MAX_PATH,
  cgroupMemoryPath = CGROUP_MEMORY_MAX_PATH,
) {
  const cgroupCpuMax = readCgroupCpuMax(cgroupCpuPath);
  const cgroupMemoryMax = readCgroupMemoryMax(cgroupMemoryPath);
  const hostCpuCount = cpus().length;
  const concurrency = workerCount(process.env, cgroupCpuMax, hostCpuCount, cgroupMemoryMax);
  const source = workerCountSource(process.env, cgroupCpuMax, hostCpuCount, cgroupMemoryMax);
  const heapMb = runnerHeapLimitMb(concurrency, cgroupMemoryMax);
  const cap =
    heapMb === undefined
      ? "no test-runner heap cap (no memory ceiling)"
      : `test-runner heap cap ${heapMb} MiB`;
  console.log(
    `mutation-workers[${packageName}]: running Stryker with concurrency ${concurrency} (from ${source}), ${cap}`,
  );
  return { concurrency, testRunnerNodeArgs: testRunnerNodeArgs(concurrency, cgroupMemoryMax) };
}
