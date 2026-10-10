// SPDX-License-Identifier: BUSL-1.1
// Licensed under the Business Source License 1.1 (see LICENSE); Change Date: four years from publication; Change License: Apache-2.0
// Copyright (c) 2026 Empower Agile
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { configDir, VENDOR_CONFIG_DIR_VARIABLE } from "../isolated-agent-config.js";
import { stagedSnapshotIn } from "../registry-delivery.js";
import {
  cleanupScratch,
  makeWorkDir,
  productionDeps,
  runCli,
  scaffoldFixture,
  seedVendorLogin,
  spawnInherit,
} from "../runner.js";

/**
 * `runner.ts`'s pure/injected logic is covered end to end (with fakes) by `runner.test.ts`; this
 * file exercises the small REAL implementations behind those seams — a real temp-dir copy, a real
 * child process, `productionDeps`'s own closures — the way `replay.test.ts` exercises the real
 * `runReplayCommand`. Every case here is fast and touches nothing outside a throwaway temp dir.
 */

describe("scaffoldFixture / cleanupScratch (the real fs implementation)", () => {
  let source: string;

  beforeEach(() => {
    source = mkdtempSync(join(tmpdir(), "nt-fixture-source-"));
    writeFileSync(join(source, "marker.txt"), "hello");
  });

  afterEach(() => {
    rmSync(source, { recursive: true, force: true });
  });

  it("copies the fixture into a fresh scratch dir, then removes it on cleanup", () => {
    const scratch = scaffoldFixture(source);
    try {
      expect(readFileSync(join(scratch, "marker.txt"), "utf-8")).toBe("hello");
    } finally {
      cleanupScratch(scratch);
    }
    expect(existsSync(scratch)).toBe(false);
  });

  // Found 2026-10-10 by a verify trial: the agent quoted the fixture's maintainer README — the page
  // that explains the case's trap — back to the user. A fixture's ROOT readme documents the case for
  // this repository; it is never part of the project under test (the Java reference's own fix).
  it.each([
    "README.md",
    "readme.md",
    "Readme.txt",
    "README",
  ])("never copies the fixture's root %s into the trial", (name) => {
    writeFileSync(join(source, name), "the trap is in the hook");
    const scratch = scaffoldFixture(source);
    try {
      expect(existsSync(join(scratch, name))).toBe(false);
      expect(existsSync(join(scratch, "marker.txt"))).toBe(true);
    } finally {
      cleanupScratch(scratch);
    }
  });

  it("keeps a README below the root — a dependency's or a package's own page is the project's", () => {
    mkdirSync(join(source, "vendor"));
    writeFileSync(join(source, "vendor", "README.md"), "kit docs");
    const scratch = scaffoldFixture(source);
    try {
      expect(readFileSync(join(scratch, "vendor", "README.md"), "utf-8")).toBe("kit docs");
    } finally {
      cleanupScratch(scratch);
    }
  });
});

describe("spawnInherit (the real child-process implementation)", () => {
  it("does not throw for a command that exits zero", () => {
    expect(() => spawnInherit(process.execPath, ["-e", "1"], process.cwd())).not.toThrow();
  });

  it("throws for a command that exits nonzero", () => {
    expect(() =>
      spawnInherit(process.execPath, ["-e", "process.exit(1)"], process.cwd()),
    ).toThrow();
  });

  // The whole point of the env parameter: a registry trial's vendor configuration has to reach the
  // CHILD process, not merely the harness. Asserted at the real OS process boundary, because a fake
  // that recorded the argument would prove nothing about what the child can read.
  it("reaches the child's own environment", () => {
    const probe = ["-e", "process.exit(process.env.NT_ENV_PROBE === 'reached' ? 0 : 1)"];

    expect(() =>
      spawnInherit(process.execPath, probe, process.cwd(), { NT_ENV_PROBE: "reached" }),
    ).not.toThrow();
    expect(() => spawnInherit(process.execPath, probe, process.cwd())).toThrow();
  });

  // The runner builds one env map per trial and hands the same object to three spawns. A merge that
  // wrote into either side would carry the grader's CLI path into the agent, or a trial's
  // configuration into this process.
  it("mutates neither the caller's map nor this process's own environment", () => {
    const supplied = { NT_ENV_PROBE: "reached" };

    spawnInherit(process.execPath, ["-e", "1"], process.cwd(), supplied);

    expect(supplied).toEqual({ NT_ENV_PROBE: "reached" });
    expect(process.env.NT_ENV_PROBE).toBeUndefined();
  });

  it("keeps the ambient environment the child already had", () => {
    expect(() =>
      spawnInherit(
        process.execPath,
        ["-e", "process.exit(process.env.PATH && process.env.NT_ENV_PROBE ? 0 : 1)"],
        process.cwd(),
        { NT_ENV_PROBE: "reached" },
      ),
    ).not.toThrow();
  });
});

describe("makeWorkDir (the real registry-trial work directory)", () => {
  it("creates the staged tree's directory with it, because `tar -C` needs one that exists", () => {
    const work = makeWorkDir();
    try {
      expect(existsSync(stagedSnapshotIn(work))).toBe(true);
      expect(readdirSync(stagedSnapshotIn(work))).toEqual([]);
    } finally {
      cleanupScratch(work);
    }
    expect(existsSync(work)).toBe(false);
  });

  it("gives each trial a directory of its own", () => {
    const first = makeWorkDir();
    const second = makeWorkDir();
    try {
      expect(first).not.toBe(second);
    } finally {
      cleanupScratch(first);
      cleanupScratch(second);
    }
  });
});

describe("seedVendorLogin (the real ambient resolution)", () => {
  const saved = process.env[VENDOR_CONFIG_DIR_VARIABLE];
  let ambient: string;
  let work: string;

  beforeEach(() => {
    ambient = mkdtempSync(join(tmpdir(), "nt-ambient-config-"));
    work = mkdtempSync(join(tmpdir(), "nt-seed-work-"));
    process.env[VENDOR_CONFIG_DIR_VARIABLE] = ambient;
  });

  afterEach(() => {
    if (saved === undefined) delete process.env[VENDOR_CONFIG_DIR_VARIABLE];
    else process.env[VENDOR_CONFIG_DIR_VARIABLE] = saved;
    rmSync(ambient, { recursive: true, force: true });
    rmSync(work, { recursive: true, force: true });
  });

  it("copies the login out of the configuration the ambient override names", () => {
    writeFileSync(join(ambient, ".credentials.json"), '{"token":"not-a-real-token"}');

    expect(seedVendorLogin(work)).toBe(true);
    expect(readdirSync(configDir(work))).toEqual([".credentials.json"]);
  });

  it("reports false — never throws — when that configuration has no login", () => {
    expect(seedVendorLogin(work)).toBe(false);
    expect(existsSync(configDir(work))).toBe(true);
  });
});

describe("productionDeps (the real closures, not the fakes runner.test.ts injects)", () => {
  it("now() returns the current time as a real Date", () => {
    const before = Date.now();
    const deps = productionDeps("/fake/evals");
    const value = deps.now();
    expect(value).toBeInstanceOf(Date);
    expect(value.getTime()).toBeGreaterThanOrEqual(before);
  });

  it("readFile() reads a real file's content from disk", () => {
    const dir = mkdtempSync(join(tmpdir(), "nt-readfile-"));
    try {
      writeFileSync(join(dir, "note.txt"), "real content");
      const deps = productionDeps("/fake/evals");
      expect(deps.readFile(join(dir, "note.txt"))).toBe("real content");
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it("appendLedgerRow() appends one JSON line to a real file", () => {
    const dir = mkdtempSync(join(tmpdir(), "nt-ledger-"));
    try {
      const ledgerPath = join(dir, "runs.jsonl");
      const deps = productionDeps("/fake/evals");
      deps.appendLedgerRow(ledgerPath, { result: "pass" });
      expect(readFileSync(ledgerPath, "utf-8")).toBe('{"result":"pass"}\n');
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it("regeneratePromotion() runs a real subprocess rooted at repoRoot (fails loud on a bad root)", () => {
    const deps = productionDeps("/definitely/not/a/real/evals/dir");
    expect(() => deps.regeneratePromotion()).toThrow();
  });
});

describe("runCli", () => {
  it("surfaces parseArgs' usage error before ever touching productionDeps", () => {
    expect(() => runCli([], "/fake/evals")).toThrow(/Usage:/);
  });
});
