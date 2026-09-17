// SPDX-License-Identifier: BUSL-1.1
// Licensed under the Business Source License 1.1 (see LICENSE); Change Date: four years from publication; Change License: Apache-2.0
// Copyright (c) 2026 Empower Agile
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  CGROUP_CPU_MAX_PATH,
  explicitCount,
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
 * `--max-children`) so both runtimes pin the same precedence: `NT_MUTATION_WORKERS` > cgroup
 * quota > host CPU count.
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
    expect(resolveWorkerCount(cpuMax)).toBe(3);
  });

  it("an absent cgroup quota file is not an error — macOS, a bare host, cgroup v1", () => {
    delete process.env[WORKERS_ENV_VAR];
    expect(resolveWorkerCount(join(dir, "absent"))).toBeGreaterThanOrEqual(1);
  });

  it("an explicit env setting overrides the real filesystem entirely", () => {
    process.env[WORKERS_ENV_VAR] = "3";
    expect(resolveWorkerCount(join(dir, "absent"))).toBe(3);
  });

  it("defaults to the real cgroup path when none is given", () => {
    delete process.env[WORKERS_ENV_VAR];
    expect(resolveWorkerCount()).toBeGreaterThanOrEqual(1);
    expect(CGROUP_CPU_MAX_PATH).toBe("/sys/fs/cgroup/cpu.max");
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
    const concurrency = resolveStrykerConcurrency("core", join(dir, "absent"));
    expect(concurrency).toBe(4);
    expect(logs).toEqual([
      `mutation-workers[core]: running Stryker with concurrency 4 (from ${WORKERS_ENV_VAR})`,
    ]);
  });

  it("an over-quota worker count is never used — a 4-CPU quota on any host yields 4, not the host's own count", () => {
    delete process.env[WORKERS_ENV_VAR];
    const cpuMax = join(dir, "cpu.max");
    writeFileSync(cpuMax, "400000 100000\n");
    const concurrency = resolveStrykerConcurrency("core", cpuMax);
    expect(concurrency).toBe(4);
    expect(logs).toEqual([
      "mutation-workers[core]: running Stryker with concurrency 4 (from cgroup cpu.max quota)",
    ]);
  });
});
