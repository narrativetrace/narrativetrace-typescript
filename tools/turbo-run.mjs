// SPDX-License-Identifier: BUSL-1.1
// Licensed under the Business Source License 1.1 (see LICENSE); Change Date: four years from publication; Change License: Apache-2.0
// Copyright (c) 2026 Empower Agile
// Every whole-repo Turbo run the per-commit gate makes goes through here, so the number of
// processes `check` starts at once comes from the machine's CPU budget and not from a library
// default.
//
// 2026-09-17 finding, the test-runner half of the F3 finding `mutation-workers.mjs` records for
// Stryker: `turbo run coverage` ran up to ten packages at once (Turbo's default `--concurrency`),
// and each package's Vitest then sized its OWN fork pool from the host's core count — up to eighty
// Node processes on an 8-core, 7.75 GB VM shared with a dozen other dev containers. Measured on
// that VM, three forced `turbo run coverage` runs each:
//   * default concurrency — 2 of 3 failed, the cgroup's `oom_kill` counter rose by 5. A forked
//     worker SIGKILLed by the kernel OOM killer surfaces as `Error: Channel closed`
//     (`ERR_IPC_CHANNEL_CLOSED`) from tinypool's `ProcessWorker.send`; esbuild lost module
//     resolution mid-build; a four-line synchronous test reported "Test timed out in 5000ms"
//     because its worker got no CPU for five seconds.
//   * budget applied — 3 of 3 green, `oom_kill` unchanged.
// Wall clock, GC and the scheduler are never test inputs (release rule 3), so the fix is to stop
// oversubscribing rather than to retry or to raise a timeout.
//
// The budget is ONE number — `workerCount` from `mutation-workers.mjs`, this being its second
// caller: `NT_MUTATION_WORKERS`, else the cgroup v2 CPU quota, else the runtime's CPU count. Turbo
// runs that many packages at a time, and each package's Vitest runs a single worker, so the total
// is the budget instead of its square. A package run on its own
// (`pnpm --filter <pkg> run coverage`) does not come through here and keeps its full pool.
//
// On the shared dev VM the binding constraint is memory, not cores, but there was no memory quota
// to read there: `memory.max` is `max`, because the 7.75 GB is SHARED by every dev container
// rather than divided between them, and `os.totalmem()` there reports the whole VM's, not this
// container's share. A number derived from either would be a guess dressed as a measurement. So
// the CPU budget was the number, and `NT_MUTATION_WORKERS` is how a host that is memory-tight for
// reasons this process cannot see says so — `NT_MUTATION_WORKERS=2 pnpm run check`.
//
// 2026-09-18 finding: a container CAN carry a real `memory.max` ceiling (the ts nightly's, 3 GB) —
// there the guess-dressed-as-measurement problem above doesn't apply, `memory.max` is an honest
// number, and ignoring it is exactly how the mutation OOM happened. So this takes the same
// memory-derived bound `mutation-workers.mjs` derives for Stryker and applies it here too: the
// package-level concurrency is `min(CPU-derived, memory-derived)`, `NT_MUTATION_WORKERS` still the
// override for either.
//
// Plain ESM, for the same reason `mutation-workers.mjs` is: it is spawned by plain Node from a
// package script, with no tsx loader in that process.

import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import { cpus } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import {
  readCgroupCpuMax,
  readCgroupMemoryMax,
  workerCount,
  workerCountSource,
} from "./mutation-workers.mjs";

/** The repository root, from this file's own location — never the caller's working directory. */
const REPO_ROOT = dirname(dirname(fileURLToPath(import.meta.url)));

/**
 * The workspace's own `turbo`, by absolute path.
 *
 * @throws {Error} when it is missing, deliberately rather than falling back to `npx turbo`:
 * `turbo` is an unscoped name, so npx would silently fetch and run an unrelated package and the
 * step would read as green having built nothing — the failure `scripts/gate.sh` documents for
 * `npx biome`, which is the same trap one directory over.
 */
export function turboBinary(repoRoot = REPO_ROOT) {
  const bin = join(repoRoot, "node_modules", ".bin", "turbo");
  if (!existsSync(bin)) {
    throw new Error(`turbo-run: ${bin} is missing — run \`pnpm install\`.`);
  }
  return bin;
}

/**
 * The Vitest pool-size channels this pins to a single worker per package. Both pools are named
 * because a package may choose either (`forks` is Vitest's default; `jsdom`-flavoured packages
 * could switch to `threads` without anyone remembering to widen this list).
 */
export const POOL_LIMIT_ENV_VARS = ["VITEST_MAX_FORKS", "VITEST_MAX_THREADS"];

/** The pool-limited environment, leaving any limit the caller set explicitly alone. */
export function poolEnv(env) {
  const limited = { ...env };
  for (const name of POOL_LIMIT_ENV_VARS) limited[name] ??= "1";
  return limited;
}

/**
 * The Turbo invocation for `task`: how many packages run at once, which input decided that, the
 * argv, and the environment to spawn it with. Pure — every input is passed in, so the derivation
 * is observable under a quota'd `cpu.max` without a quota'd machine.
 */
export function turboPlan(task, extraArgs, env, cgroupCpuMax, hostCpuCount, cgroupMemoryMax) {
  const workers = workerCount(env, cgroupCpuMax, hostCpuCount, cgroupMemoryMax);
  return {
    workers,
    source: workerCountSource(env, cgroupCpuMax, hostCpuCount, cgroupMemoryMax),
    args: ["run", task, `--concurrency=${workers}`, ...extraArgs],
    env: poolEnv(env),
  };
}

/** Announces the plan once, so a gate log says which budget the run used and where it came from. */
function announce(task, plan) {
  console.log(
    `turbo-run[${task}]: ${plan.workers} package(s) at a time (from ${plan.source}), ` +
      "one test worker each",
  );
}

function main(argv) {
  const [task, ...extraArgs] = argv;
  if (!task) {
    console.error("Usage: node tools/turbo-run.mjs <turbo-task> [turbo args...]");
    process.exit(1);
  }
  const plan = turboPlan(
    task,
    extraArgs,
    process.env,
    readCgroupCpuMax(),
    cpus().length,
    readCgroupMemoryMax(),
  );
  announce(task, plan);
  const child = spawn(turboBinary(), plan.args, {
    stdio: "inherit",
    env: plan.env,
    cwd: REPO_ROOT,
  });
  child.on("error", (error) => {
    console.error(`turbo-run[${task}]: could not start turbo — ${error.message}`);
    process.exit(1);
  });
  child.on("exit", (code, signal) => process.exit(signal ? 1 : (code ?? 1)));
}

if (process.argv[1]?.endsWith("turbo-run.mjs")) main(process.argv.slice(2));
