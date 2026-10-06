// SPDX-License-Identifier: BUSL-1.1
// Licensed under the Business Source License 1.1 (see LICENSE); Change Date: four years from publication; Change License: Apache-2.0
// Copyright (c) 2026 Empower Agile
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  cleanupScratch,
  productionDeps,
  runCli,
  scaffoldFixture,
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
