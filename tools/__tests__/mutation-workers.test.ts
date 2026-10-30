// SPDX-License-Identifier: BUSL-1.1
// Licensed under the Business Source License 1.1 (see LICENSE); Change Date: four years from publication; Change License: Apache-2.0
// Copyright (c) 2026 Empower Agile
import { existsSync, mkdtempSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  CGROUP_CPU_MAX_PATH,
  CGROUP_MEMORY_MAX_PATH,
  explicitCount,
  MEASURED_PEAK_RUNNER_BYTES,
  MIN_RUNNER_HEAP_BYTES,
  memoryCount,
  quotaCount,
  resolveStrykerOptions,
  resolveWorkerCount,
  runnerHeapLimitMb,
  testRunnerNodeArgs,
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

const MIB = 1024 * 1024;
const THREE_GIB = String(3 * 1024 * MIB);

describe("runnerHeapLimitMb — one test runner's share of the container's memory (B-219)", () => {
  it("is the ceiling split over the workers plus Stryker's own process — the nightly's 3 GiB, 4 workers", () => {
    expect(runnerHeapLimitMb(4, THREE_GIB)).toBe(614);
  });

  it("never drops below the floor a clean run needs, however many workers share the ceiling", () => {
    expect(runnerHeapLimitMb(16, THREE_GIB)).toBe(MIN_RUNNER_HEAP_BYTES / MIB);
  });

  it("uses a 512 MiB floor, the one B-218 measured for the Python runners", () => {
    expect(MIN_RUNNER_HEAP_BYTES).toBe(512 * MIB);
  });

  it("rounds down so the shares never add up past the ceiling", () => {
    expect(runnerHeapLimitMb(2, String(3001 * MIB))).toBe(1000);
  });

  it("sets no limit where the container sets no ceiling", () => {
    expect(runnerHeapLimitMb(4, "max\n")).toBeUndefined();
    expect(runnerHeapLimitMb(4, undefined)).toBeUndefined();
    expect(runnerHeapLimitMb(4, "garbage")).toBeUndefined();
  });

  it("rejects a worker count that is not a positive integer", () => {
    expect(() => runnerHeapLimitMb(0, THREE_GIB)).toThrow(RangeError);
    expect(() => runnerHeapLimitMb(1.5, THREE_GIB)).toThrow(RangeError);
  });
});

describe("testRunnerNodeArgs — the Node flags each Stryker test-runner process starts with", () => {
  it("caps the heap at the runner's share, so a runaway mutant fails alone instead of feeding the OOM killer", () => {
    expect(testRunnerNodeArgs(4, THREE_GIB)).toEqual(["--max-old-space-size=614"]);
  });

  it("passes nothing where there is no ceiling to share — macOS, a bare host", () => {
    expect(testRunnerNodeArgs(4, undefined)).toEqual([]);
  });
});

describe("resolveStrykerOptions — what a package's stryker.config.mjs spreads in", () => {
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

  it("sizes the heap cap from the same worker count it assigns as concurrency", () => {
    process.env[WORKERS_ENV_VAR] = "4";
    const memoryMax = join(dir, "memory.max");
    writeFileSync(memoryMax, THREE_GIB);
    expect(resolveStrykerOptions("core", join(dir, "absent"), memoryMax)).toEqual({
      concurrency: 4,
      testRunnerNodeArgs: ["--max-old-space-size=614"],
    });
    expect(logs).toEqual([
      `mutation-workers[core]: running Stryker with concurrency 4 (from ${WORKERS_ENV_VAR}), test-runner heap cap 614 MiB`,
    ]);
  });

  it("an over-quota worker count is never used — a 4-CPU quota on any host yields 4, not the host's own count", () => {
    const cpuMax = join(dir, "cpu.max");
    writeFileSync(cpuMax, "400000 100000\n");
    expect(resolveStrykerOptions("core", cpuMax, join(dir, "absent-memory")).concurrency).toBe(4);
    expect(logs[0]).toMatch(/\(from cgroup cpu\.max quota\), no test-runner heap cap/);
  });

  it("a memory ceiling below the CPU-derived count is named, used, and sizes the cap", () => {
    process.env[WORKERS_ENV_VAR] = "8";
    const memoryMax = join(dir, "memory.max");
    writeFileSync(memoryMax, THREE_GIB);
    expect(resolveStrykerOptions("core", join(dir, "absent"), memoryMax)).toEqual({
      concurrency: 4,
      testRunnerNodeArgs: ["--max-old-space-size=614"],
    });
    expect(logs[0]).toMatch(/\(from cgroup memory\.max ceiling\), test-runner heap cap 614 MiB$/);
  });

  it("announces no cap where the container sets no ceiling", () => {
    process.env[WORKERS_ENV_VAR] = "2";
    expect(resolveStrykerOptions("core", join(dir, "absent"), join(dir, "absent-memory"))).toEqual({
      concurrency: 2,
      testRunnerNodeArgs: [],
    });
    expect(logs).toEqual([
      `mutation-workers[core]: running Stryker with concurrency 2 (from ${WORKERS_ENV_VAR}), no test-runner heap cap (no memory ceiling)`,
    ]);
  });
});

describe("every package's stryker.config.mjs passes the resolved options", () => {
  const repoRoot = join(import.meta.dirname, "..", "..");
  const configs = readdirSync(join(repoRoot, "packages"))
    .map((name) => join(repoRoot, "packages", name, "stryker.config.mjs"))
    .filter((path) => existsSync(path));
  let originalLog: typeof console.log;

  beforeEach(() => {
    originalLog = console.log;
    console.log = () => {};
    process.env[WORKERS_ENV_VAR] = "4";
  });

  afterEach(() => {
    console.log = originalLog;
    delete process.env[WORKERS_ENV_VAR];
  });

  it("finds the packages' configs at all", () => {
    expect(configs.length).toBeGreaterThan(0);
  });

  it.each(
    configs,
  )("%s carries this machine's concurrency and test-runner heap cap", async (path) => {
    const { default: config } = await import(pathToFileURL(path).href);
    const expected = resolveStrykerOptions("expected");
    expect(config.concurrency).toBe(expected.concurrency);
    expect(config.testRunnerNodeArgs).toEqual(expected.testRunnerNodeArgs);
  });
});
