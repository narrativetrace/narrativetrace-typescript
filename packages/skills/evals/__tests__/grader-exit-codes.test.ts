// SPDX-License-Identifier: BUSL-1.1
// Licensed under the Business Source License 1.1 (see LICENSE); Change Date: four years from publication; Change License: Apache-2.0
// Copyright (c) 2026 Empower Agile
import { spawnSync } from "node:child_process";
import { chmodSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

/**
 * Regression coverage for the 2026-09-13 finding: `graders/verify.sh` used `set -e` with a bare
 * `report=$(npx narrativetrace doctor --json)`, so the grader aborted the instant `doctor` exited
 * nonzero — which is the DOCUMENTED correct exit for two of these fixtures (one real trap fails on
 * the unmodified fixture) — before its JSON-shape assertions ever ran. The fix captures the exit
 * code explicitly (`&&`/`||`, which `set -e` does not treat as a failure) and asserts it before
 * running the shape assertions. These tests never invoke the real `narrativetrace` CLI: a stub
 * `npx` on PATH stands in for `doctor`, so the assertion under test is the shell script's own
 * control flow, not the CLI's behavior (already covered by `packages/cli`'s own tests).
 */

const EVALS_DIR = join(import.meta.dirname, "..");

interface StubNpx {
  readonly json: string;
  readonly exitCode: number;
}

/** Writes an executable `npx` stub to `binDir` that ignores its argv, prints `json`, exits `exitCode`. */
function writeStubNpx(binDir: string, stub: StubNpx): void {
  const script = `#!/bin/sh\ncat <<'EOF'\n${stub.json}\nEOF\nexit ${stub.exitCode}\n`;
  const path = join(binDir, "npx");
  writeFileSync(path, script);
  chmodSync(path, 0o755);
}

/** Runs one grader script with a stubbed `npx` ahead of the real PATH, in a scratch cwd. */
function runGraderWithStubNpx(
  verifyShPath: string,
  cwd: string,
  stub: StubNpx,
): { status: number | null; stdout: string; stderr: string } {
  const binDir = mkdtempSync(join(tmpdir(), "nt-stub-npx-"));
  try {
    writeStubNpx(binDir, stub);
    const result = spawnSync("sh", [verifyShPath], {
      cwd,
      env: { ...process.env, PATH: `${binDir}:${process.env.PATH}` },
      encoding: "utf8",
    });
    return { status: result.status, stdout: result.stdout, stderr: result.stderr };
  } finally {
    rmSync(binDir, { recursive: true, force: true });
  }
}

/** Eleven findings, one of them `trap.redaction-proof` failing — the shape both doctor cases expect. */
function elevenFindingsWithRedactionFailing(): string {
  const ids = [
    "toolchain.node-engine",
    "toolchain.vitest-peer",
    "toolchain.sibling-packages",
    "toolchain.output-env",
    "toolchain.reporter-subpath",
    "toolchain.trace-object-keys",
    "toolchain.silent-sink",
    "toolchain.parameter-arg0",
    "trap.redaction-proof",
    "toolchain.approval-traces",
    "toolchain.llms-before-you-start",
  ];
  const findings = ids.map((id) => ({
    id,
    status: id === "trap.redaction-proof" ? "fail" : "pass",
  }));
  return JSON.stringify({ findings });
}

describe("narrativetrace-doctor/happy-path grader reaches its shape assertions past doctor's documented exit 1", () => {
  let cwd: string;
  beforeEach(() => {
    cwd = mkdtempSync(join(tmpdir(), "nt-fixture-"));
  });
  afterEach(() => rmSync(cwd, { recursive: true, force: true }));

  it("passes when doctor exits 1 with a well-formed 11-finding report (the documented shape)", () => {
    const verifyShPath = join(
      EVALS_DIR,
      "narrativetrace-doctor",
      "happy-path",
      "graders",
      "verify.sh",
    );
    const result = runGraderWithStubNpx(verifyShPath, cwd, {
      json: elevenFindingsWithRedactionFailing(),
      exitCode: 1,
    });
    expect({ status: result.status, stderr: result.stderr }).toEqual({ status: 0, stderr: "" });
  });

  it("fails with a clear message when doctor exits 2 (a crash, never the documented value)", () => {
    const verifyShPath = join(
      EVALS_DIR,
      "narrativetrace-doctor",
      "happy-path",
      "graders",
      "verify.sh",
    );
    const result = runGraderWithStubNpx(verifyShPath, cwd, {
      json: elevenFindingsWithRedactionFailing(),
      exitCode: 2,
    });
    expect(result.status).not.toBe(0);
    expect(result.stderr).toMatch(/expected doctor to exit 1/);
  });
});

describe("narrativetrace-doctor/deviation-redaction-gap grader reaches its shape assertions past doctor's documented exit 1", () => {
  let cwd: string;
  beforeEach(() => {
    cwd = mkdtempSync(join(tmpdir(), "nt-fixture-"));
  });
  afterEach(() => rmSync(cwd, { recursive: true, force: true }));

  it("passes when doctor exits 1 with trap.redaction-proof failing", () => {
    const verifyShPath = join(
      EVALS_DIR,
      "narrativetrace-doctor",
      "deviation-redaction-gap",
      "graders",
      "verify.sh",
    );
    const result = runGraderWithStubNpx(verifyShPath, cwd, {
      json: elevenFindingsWithRedactionFailing(),
      exitCode: 1,
    });
    expect({ status: result.status, stderr: result.stderr }).toEqual({ status: 0, stderr: "" });
  });
});

describe("add-narrative-tracing/happy-path grader reaches its toolchain.* assertions past a nonzero doctor exit", () => {
  let cwd: string;
  beforeEach(() => {
    cwd = mkdtempSync(join(tmpdir(), "nt-fixture-"));
  });
  afterEach(() => rmSync(cwd, { recursive: true, force: true }));

  function scaffoldColdInstallOutputs(): void {
    writeFileSync(join(cwd, "package.json"), JSON.stringify({ type: "module" }));
    mkdirSync(join(cwd, "narrativetrace-output"), { recursive: true });
    writeFileSync(join(cwd, "narrativetrace-output", "trace.md"), "# trace\n");
  }

  it("passes when doctor exits 1 (trap.redaction-proof unproven here too) but every toolchain.* finding holds", () => {
    scaffoldColdInstallOutputs();
    const verifyShPath = join(
      EVALS_DIR,
      "add-narrative-tracing",
      "happy-path",
      "graders",
      "verify.sh",
    );
    const result = runGraderWithStubNpx(verifyShPath, cwd, {
      json: elevenFindingsWithRedactionFailing(),
      exitCode: 1,
    });
    expect({ status: result.status, stderr: result.stderr }).toEqual({ status: 0, stderr: "" });
  });

  it("fails with a clear message when doctor exits 2 (a crash)", () => {
    scaffoldColdInstallOutputs();
    const verifyShPath = join(
      EVALS_DIR,
      "add-narrative-tracing",
      "happy-path",
      "graders",
      "verify.sh",
    );
    const result = runGraderWithStubNpx(verifyShPath, cwd, {
      json: elevenFindingsWithRedactionFailing(),
      exitCode: 2,
    });
    expect(result.status).not.toBe(0);
    expect(result.stderr).toMatch(/expected doctor to exit 0 or 1/);
  });
});
