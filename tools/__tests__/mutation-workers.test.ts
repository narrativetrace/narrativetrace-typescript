// SPDX-License-Identifier: BUSL-1.1
// Licensed under the Business Source License 1.1 (see LICENSE); Change Date: four years from publication; Change License: Apache-2.0
// Copyright (c) 2026 Empower Agile
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  CGROUP_CPU_MAX_PATH,
  CGROUP_MEMORY_MAX_PATH,
  explicitCount,
  MEASURED_PEAK_RUNNER_BYTES,
  memoryCount,
  quotaCount,
  resolveStrykerConcurrency,
  resolveWorkerCount,
  WORKERS_ENV_VAR,
  workerCount,
  workerCountSource,
} from "../mutation-workers.mjs";

/**
 * `tools/mutation-workers.mjs`: the worker-pool size every package's `stryker.config.mjs` runs
 * Stryker with. Mirrors the analogous `scripts/mutation_workers.py` test suite (mutmut's
 * `--max-children`) so both runtimes pin the same precedence: `NT_MUTATION_WORKERS` > cgroup CPU
 * quota > host CPU count, then capped by the cgroup memory ceiling (2026-09-18 finding).
 */

describe("workerCount from the environment", () => {
  it("an explicit setting wins over every derivation", () => {
    expect(workerCount({ [WORKERS_ENV_VAR]: "4" }, "max 100000\n", 8)).toBe(4);
  });

  it("a non-integer setting is rejected rather than silently ignored", () => {
    expect(() => workerCount({ [WORKERS_ENV_VAR]: "four" }, undefined, 8)).toThrow(
      /^NT_MUTATION_WORKERS must be a positive integer/,
    );
  });

  it("a zero or negative setting is rejected", () => {
    expect(() => workerCount({ [WORKERS_ENV_VAR]: "0" }, undefined, 8)).toThrow(
      /^NT_MUTATION_WORKERS must be a positive integer/,
    );
    expect(() => workerCount({ [WORKERS_ENV_VAR]: "-1" }, undefined, 8)).toThrow(
      /^NT_MUTATION_WORKERS must be a positive integer/,
    );
  });

  it("a blank setting falls through to the derivation, never raises, never reads as a count", () => {
    expect(workerCount({ [WORKERS_ENV_VAR]: "" }, "400000 100000\n", 8)).toBe(4);
  });
});

describe("workerCount from the cgroup quota", () => {
  it("a whole-number quota is that many workers — the finding's own case: 4-CPU quota, 8-core host, never eight", () => {
    expect(workerCount({}, "400000 100000\n", 8)).toBe(4);
  });

  it("a fractional quota rounds up so the pool is never empty", () => {
    expect(workerCount({}, "450000 100000\n", 8)).toBe(5);
  });

  it("a sub-single-cpu quota still yields one worker", () => {
    expect(workerCount({}, "50000 100000\n", 8)).toBe(1);
  });

  it("an unlimited quota (`max`) falls back to the runtime cpu count", () => {
    expect(workerCount({}, "max 100000\n", 8)).toBe(8);
  });

  it("no cgroup file falls back to the runtime cpu count", () => {
    expect(workerCount({}, undefined, 8)).toBe(8);
  });

  it("an unparsable cgroup file falls back to the runtime cpu count", () => {
    expect(workerCount({}, "garbage\n", 8)).toBe(8);
  });

  it("a zero period is not a division by zero", () => {
    expect(workerCount({}, "400000 0\n", 8)).toBe(8);
  });

  it("an unknown host cpu count still yields one worker", () => {
    expect(workerCount({}, undefined, 0)).toBe(1);
  });
});

describe("quotaCount", () => {
  it("returns undefined for a quota that sets no limit", () => {
    expect(quotaCount("max 100000\n")).toBeUndefined();
  });

  it("returns undefined for a line that isn't two fields", () => {
    expect(quotaCount("garbage\n")).toBeUndefined();
  });
});

describe("explicitCount", () => {
  it("accepts a positive integer with surrounding whitespace", () => {
    expect(explicitCount(" 6 \n")).toBe(6);
  });
});

describe("memoryCount", () => {
  it("returns undefined for a ceiling that sets no limit", () => {
    expect(memoryCount("max\n")).toBeUndefined();
  });

  it("returns undefined for content that doesn't parse as bytes", () => {
    expect(memoryCount("garbage\n")).toBeUndefined();
  });

  it("floors the per-runner-byte division so the pool is never oversized", () => {
    // 3 GiB / 700 MiB = 4.39... -> 4, the nightly's own 3 GB container.
    expect(memoryCount(String(3 * 1024 * 1024 * 1024))).toBe(4);
  });

  it("floors at one worker so the pool is never empty", () => {
    expect(memoryCount(String(1024 * 1024))).toBe(1);
  });

  it("uses the measured constant, not a rounder number", () => {
    expect(MEASURED_PEAK_RUNNER_BYTES).toBe(700 * 1024 * 1024);
  });
});

describe("workerCount capped by the cgroup memory ceiling", () => {
  it("a quota'd memory ceiling below the CPU-derived count wins — the smaller count", () => {
    // No CPU quota (8 workers), 3 GB memory / 700 MiB -> 4: memory is the binding constraint.
    expect(workerCount({}, "max 100000\n", 8, String(3 * 1024 * 1024 * 1024))).toBe(4);
  });

  it("`max` memory applies no bound — the CPU-derived count is unchanged", () => {
    expect(workerCount({}, "max 100000\n", 8, "max\n")).toBe(8);
  });

  it("an absent memory reading applies no bound", () => {
    expect(workerCount({}, "max 100000\n", 8, undefined)).toBe(8);
  });

  it("a generous memory ceiling never widens a tighter CPU-derived count", () => {
    expect(workerCount({}, "400000 100000\n", 8, String(64 * 1024 * 1024 * 1024))).toBe(4);
  });

  it("caps even an explicit NT_MUTATION_WORKERS — safety over intent", () => {
    const mem = String(3 * 1024 * 1024 * 1024); // memory bound 4
    expect(workerCount({ [WORKERS_ENV_VAR]: "8" }, undefined, 8, mem)).toBe(4);
  });
});

describe("workerCountSource", () => {
  it("names NT_MUTATION_WORKERS when it decided the result", () => {
    expect(workerCountSource({ [WORKERS_ENV_VAR]: "4" }, undefined)).toBe(WORKERS_ENV_VAR);
  });

  it("names the cgroup quota when it decided the result", () => {
    expect(workerCountSource({}, "400000 100000\n")).toBe("cgroup cpu.max quota");
  });

  it("names the runtime cpu count when neither the env nor the quota decided", () => {
    expect(workerCountSource({}, "max 100000\n")).toBe("runtime CPU count");
    expect(workerCountSource({}, undefined)).toBe("runtime CPU count");
  });

  it("names the memory ceiling when it is the binding constraint", () => {
    const mem = String(3 * 1024 * 1024 * 1024); // memory bound 4, CPU-derived would be 8
    expect(workerCountSource({}, "max 100000\n", 8, mem)).toBe("cgroup memory.max ceiling");
  });

  it("keeps the CPU-side name on a tie — memory did not narrow the result", () => {
    const mem = String(4 * 700 * 1024 * 1024); // memory bound exactly 4, quota also 4
    expect(workerCountSource({}, "400000 100000\n", 8, mem)).toBe("cgroup cpu.max quota");
  });

  it("names the memory ceiling even over an explicit setting it narrowed", () => {
    const mem = String(3 * 1024 * 1024 * 1024); // memory bound 4, explicit was 8
    expect(workerCountSource({ [WORKERS_ENV_VAR]: "8" }, undefined, 8, mem)).toBe(
      "cgroup memory.max ceiling",
    );
  });
});

describe("resolveWorkerCount against the real filesystem", () => {
  let dir: string;

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), "nt-mutation-workers-"));
  });

  afterEach(() => {
    delete process.env[WORKERS_ENV_VAR];
    rmSync(dir, { recursive: true, force: true });
  });

  it("reads the cgroup quota file when it exists — proven read, not just parsed", () => {
    delete process.env[WORKERS_ENV_VAR];
    const cpuMax = join(dir, "cpu.max");
    writeFileSync(cpuMax, "300000 100000\n");
    expect(resolveWorkerCount(cpuMax, join(dir, "absent-memory"))).toBe(3);
  });

  it("an absent cgroup quota file is not an error — macOS, a bare host, cgroup v1", () => {
    delete process.env[WORKERS_ENV_VAR];
    expect(
      resolveWorkerCount(join(dir, "absent"), join(dir, "absent-memory")),
    ).toBeGreaterThanOrEqual(1);
  });

  it("an explicit env setting overrides the real filesystem entirely, but not a tighter memory ceiling", () => {
    process.env[WORKERS_ENV_VAR] = "3";
    expect(resolveWorkerCount(join(dir, "absent"), join(dir, "absent-memory"))).toBe(3);
  });

  it("reads the cgroup memory file when it exists and caps the result", () => {
    delete process.env[WORKERS_ENV_VAR];
    const memoryMax = join(dir, "memory.max");
    writeFileSync(memoryMax, String(3 * 1024 * 1024 * 1024));
    expect(resolveWorkerCount(join(dir, "absent"), memoryMax)).toBe(4);
  });

  it("defaults to the real cgroup paths when none is given", () => {
    delete process.env[WORKERS_ENV_VAR];
    expect(resolveWorkerCount()).toBeGreaterThanOrEqual(1);
    expect(CGROUP_CPU_MAX_PATH).toBe("/sys/fs/cgroup/cpu.max");
    expect(CGROUP_MEMORY_MAX_PATH).toBe("/sys/fs/cgroup/memory.max");
  });
});

describe("resolveStrykerConcurrency — the value a package's stryker.config.mjs assigns", () => {
  let dir: string;
  let logs: string[];
  let originalLog: typeof console.log;

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), "nt-mutation-workers-"));
    logs = [];
    originalLog = console.log;
    console.log = (...args: unknown[]) => {
      logs.push(args.join(" "));
    };
  });

  afterEach(() => {
    console.log = originalLog;
    delete process.env[WORKERS_ENV_VAR];
    rmSync(dir, { recursive: true, force: true });
  });

  it("the derived count is the value assigned as `concurrency` — the flag reaches the config", () => {
    process.env[WORKERS_ENV_VAR] = "4";
    const concurrency = resolveStrykerConcurrency(
      "core",
      join(dir, "absent"),
      join(dir, "absent-memory"),
    );
    expect(concurrency).toBe(4);
    expect(logs).toEqual([
      `mutation-workers[core]: running Stryker with concurrency 4 (from ${WORKERS_ENV_VAR})`,
    ]);
  });

  it("an over-quota worker count is never used — a 4-CPU quota on any host yields 4, not the host's own count", () => {
    delete process.env[WORKERS_ENV_VAR];
    const cpuMax = join(dir, "cpu.max");
    writeFileSync(cpuMax, "400000 100000\n");
    const concurrency = resolveStrykerConcurrency("core", cpuMax, join(dir, "absent-memory"));
    expect(concurrency).toBe(4);
    expect(logs).toEqual([
      "mutation-workers[core]: running Stryker with concurrency 4 (from cgroup cpu.max quota)",
    ]);
  });

  it("a memory ceiling below the CPU-derived count is named and used", () => {
    delete process.env[WORKERS_ENV_VAR];
    const memoryMax = join(dir, "memory.max");
    writeFileSync(memoryMax, String(3 * 1024 * 1024 * 1024));
    const concurrency = resolveStrykerConcurrency("core", join(dir, "absent"), memoryMax);
    expect(concurrency).toBeLessThanOrEqual(4);
    expect(logs[0]).toMatch(
      /^mutation-workers\[core\]: running Stryker with concurrency \d+ \(from (cgroup memory\.max ceiling|runtime CPU count)\)$/,
    );
  });
});
