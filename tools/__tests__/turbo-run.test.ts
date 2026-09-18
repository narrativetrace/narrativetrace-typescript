// SPDX-License-Identifier: BUSL-1.1
// Licensed under the Business Source License 1.1 (see LICENSE); Change Date: four years from publication; Change License: Apache-2.0
// Copyright (c) 2026 Empower Agile
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, test } from "vitest";
import { POOL_LIMIT_ENV_VARS, turboBinary, turboPlan } from "../turbo-run.mjs";

const QUOTA_FOUR_CPUS = "400000 100000";
const NO_QUOTA = "max 100000";

describe("turboPlan concurrency", () => {
  test("runs as many packages at once as the cgroup CPU quota allows", () => {
    // The whole point of the finding: turbo's own default is 10 regardless of the machine.
    const plan = turboPlan("coverage", [], {}, QUOTA_FOUR_CPUS, 8);

    expect(plan.workers).toBe(4);
    expect(plan.args).toContain("--concurrency=4");
    expect(plan.source).toBe("cgroup cpu.max quota");
  });

  test("lets an explicit worker budget override the quota", () => {
    const plan = turboPlan("test", [], { NT_MUTATION_WORKERS: "2" }, QUOTA_FOUR_CPUS, 8);

    expect(plan.args).toContain("--concurrency=2");
    expect(plan.source).toBe("NT_MUTATION_WORKERS");
  });

  test("falls back to the runtime CPU count when the cgroup sets no quota", () => {
    const plan = turboPlan("build", [], {}, NO_QUOTA, 8);

    expect(plan.args).toContain("--concurrency=8");
    expect(plan.source).toBe("runtime CPU count");
  });

  test("never lets a bad budget read as 'use the whole host'", () => {
    expect(() => turboPlan("build", [], { NT_MUTATION_WORKERS: "0" }, QUOTA_FOUR_CPUS, 8)).toThrow(
      /positive integer/,
    );
  });

  test("names the task and passes extra turbo arguments through after it", () => {
    const plan = turboPlan("coverage", ["--force", "--output-logs=errors-only"], {}, NO_QUOTA, 2);

    expect(plan.args).toStrictEqual([
      "run",
      "coverage",
      "--concurrency=2",
      "--force",
      "--output-logs=errors-only",
    ]);
  });

  test("a cgroup memory ceiling caps the CPU-derived concurrency — the 2026-09-18 finding", () => {
    // No CPU quota (8 workers), 3 GB memory / 700 MiB -> 4: the ts nightly's own container.
    const plan = turboPlan("mutate", [], {}, NO_QUOTA, 8, String(3 * 1024 * 1024 * 1024));

    expect(plan.workers).toBe(4);
    expect(plan.args).toContain("--concurrency=4");
    expect(plan.source).toBe("cgroup memory.max ceiling");
  });

  test("`max` memory applies no bound — the CPU-derived count is unchanged", () => {
    const plan = turboPlan("mutate", [], {}, QUOTA_FOUR_CPUS, 8, "max");

    expect(plan.workers).toBe(4);
    expect(plan.source).toBe("cgroup cpu.max quota");
  });

  test("a memory ceiling caps even an explicit worker budget", () => {
    const plan = turboPlan(
      "mutate",
      [],
      { NT_MUTATION_WORKERS: "8" },
      NO_QUOTA,
      8,
      String(3 * 1024 * 1024 * 1024),
    );

    expect(plan.workers).toBe(4);
    expect(plan.source).toBe("cgroup memory.max ceiling");
  });
});

describe("turboPlan test-worker pools", () => {
  test("gives each package one test worker, so the total is the budget and not its square", () => {
    // Without this, N packages each fork a pool of their own sized from the host's cores.
    const plan = turboPlan("coverage", [], {}, QUOTA_FOUR_CPUS, 8);

    for (const name of POOL_LIMIT_ENV_VARS) expect(plan.env[name]).toBe("1");
  });

  test("keeps a pool size the caller set explicitly", () => {
    const plan = turboPlan("coverage", [], { VITEST_MAX_FORKS: "3" }, QUOTA_FOUR_CPUS, 8);

    expect(plan.env.VITEST_MAX_FORKS).toBe("3");
    expect(plan.env.VITEST_MAX_THREADS).toBe("1");
  });

  test("carries the surrounding environment through to turbo", () => {
    const plan = turboPlan("coverage", [], { PATH: "/usr/bin" }, QUOTA_FOUR_CPUS, 8);

    expect(plan.env.PATH).toBe("/usr/bin");
  });
});

describe("turboBinary", () => {
  let root: string;

  beforeEach(() => {
    root = mkdtempSync(join(tmpdir(), "nt-turbo-run-"));
  });

  afterEach(() => {
    rmSync(root, { recursive: true, force: true });
  });

  test("uses the workspace's own turbo, by absolute path", () => {
    mkdirSync(join(root, "node_modules", ".bin"), { recursive: true });
    writeFileSync(join(root, "node_modules", ".bin", "turbo"), "");

    expect(turboBinary(root)).toBe(join(root, "node_modules", ".bin", "turbo"));
  });

  test("fails loudly when it is missing rather than letting npx fetch a stranger", () => {
    // `turbo` is an unscoped name: `npx turbo` on a broken install fetches an unrelated
    // package and the build step reads as green having built nothing.
    expect(() => turboBinary(root)).toThrow(/pnpm install/);
  });
});
