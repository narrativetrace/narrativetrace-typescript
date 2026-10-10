// SPDX-License-Identifier: BUSL-1.1
// Licensed under the Business Source License 1.1 (see LICENSE); Change Date: four years from publication; Change License: Apache-2.0
// Copyright (c) 2026 Empower Agile
import { execFileSync } from "node:child_process";
import { chmodSync, existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { delimiter, join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  aggregate,
  CHECKS,
  executableOnPath,
  record,
  recordedStatus,
  stageFromHead,
  type VendorCheck,
  type VendorCheckResult,
  validate,
} from "../vendor-validate-support.js";

const REPO_ROOT = join(import.meta.dirname, "..", "..");

/** Whether `path` is committed at HEAD of the repository at REPO_ROOT (false: no repository, or not committed). */
function committedAtHead(path: string): boolean {
  try {
    execFileSync("git", ["cat-file", "-e", `HEAD:${path}`], { cwd: REPO_ROOT, stdio: "ignore" });
    return true;
  } catch {
    return false;
  }
}

/** A fake vendor tool: a shell script exiting `probeExit` on `--probe`, `validateExit` otherwise. */
function fakeTool(
  dir: string,
  name: string,
  probeExit: number,
  validateExit: number,
  output = "",
): string {
  const path = join(dir, name);
  writeFileSync(
    path,
    `#!/bin/sh\nif [ "$1" = "--probe" ]; then exit ${probeExit}; fi\nprintf '%s' "${output}"\nexit ${validateExit}\n`,
  );
  chmodSync(path, 0o755);
  return path;
}

function check(overrides: Partial<VendorCheck> = {}): VendorCheck {
  return {
    tool: "fake-tool",
    probe: ["--probe"],
    validate: ["--validate"],
    artifact: "fixture.json",
    stagedPaths: ["fixture.json"],
    installHint: "install fake-tool",
    ...overrides,
  };
}

describe("CHECKS", () => {
  it("holds one row for the agent CLI against the marketplace file", () => {
    expect(CHECKS).toEqual([
      {
        tool: "claude",
        probe: ["--version"],
        validate: ["plugin", "validate"],
        artifact: ".claude-plugin/marketplace.json",
        stagedPaths: [".claude-plugin", ".claude/skills"],
        installHint: "install the agent CLI (npm i -g @anthropic-ai/claude-code) and re-run",
      },
    ]);
  });
});

describe("executableOnPath", () => {
  let dir: string;

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), "vendor-validate-path-"));
  });

  afterEach(() => {
    rmSync(dir, { recursive: true, force: true });
  });

  it("finds an executable file on one of PATH's directories", () => {
    const path = fakeTool(dir, "fake-tool", 0, 0);
    expect(executableOnPath("fake-tool", dir)).toBe(path);
  });

  it("returns undefined when no PATH directory has it", () => {
    expect(executableOnPath("does-not-exist", dir)).toBeUndefined();
  });

  it("returns undefined for a non-executable file of the same name", () => {
    writeFileSync(join(dir, "not-executable"), "#!/bin/sh\nexit 0\n");
    expect(executableOnPath("not-executable", dir)).toBeUndefined();
  });

  it("searches multiple PATH entries in order", () => {
    const other = mkdtempSync(join(tmpdir(), "vendor-validate-path-2-"));
    try {
      const path = fakeTool(other, "fake-tool", 0, 0);
      expect(executableOnPath("fake-tool", [dir, other].join(delimiter))).toBe(path);
    } finally {
      rmSync(other, { recursive: true, force: true });
    }
  });

  it("treats an undefined PATH as empty, never throwing", () => {
    expect(executableOnPath("fake-tool", undefined)).toBeUndefined();
  });
});

describe("validate", () => {
  let dir: string;

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), "vendor-validate-run-"));
  });

  afterEach(() => {
    rmSync(dir, { recursive: true, force: true });
  });

  it("skips, naming the tool and the install hint, when the tool is not on PATH", () => {
    const result = validate(check(), dir, "/does/not/exist");
    expect(result.outcome).toBe("skipped");
    expect(result.message).toContain("not found on PATH");
    expect(result.message).toContain("install fake-tool");
  });

  it("skips when the tool is present but its own probe fails", () => {
    fakeTool(dir, "fake-tool", 1, 0);
    const result = validate(check(), dir, dir);
    expect(result.outcome).toBe("skipped");
    expect(result.message).toContain("its own probe failed");
  });

  it("passes when the probe and the validator both exit zero", () => {
    fakeTool(dir, "fake-tool", 0, 0, "all good");
    const result = validate(check(), dir, dir);
    expect(result.outcome).toBe("passed");
    expect(result.message).toBe("validated fixture.json");
    expect(result.output).toBe("all good");
  });

  it("fails, carrying the validator's own output, when the validator rejects the artifact", () => {
    fakeTool(dir, "fake-tool", 0, 3, "rejected: bad shape");
    const result = validate(check(), dir, dir);
    expect(result.outcome).toBe("failed");
    expect(result.message).toContain("exit 3");
    expect(result.output).toBe("rejected: bad shape");
  });
});

describe("aggregate", () => {
  const row = (outcome: VendorCheckResult["outcome"]): VendorCheckResult => ({
    tool: "t",
    artifact: "a",
    outcome,
    message: "",
    output: "",
  });

  it("is skipped for an empty result list", () => {
    expect(aggregate([])).toBe("skipped");
  });

  it("is skipped when every row skipped", () => {
    expect(aggregate([row("skipped"), row("skipped")])).toBe("skipped");
  });

  it("is passed when at least one row passed and none failed", () => {
    expect(aggregate([row("skipped"), row("passed")])).toBe("passed");
  });

  it("is failed when any row failed, even alongside a passed one", () => {
    expect(aggregate([row("passed"), row("failed")])).toBe("failed");
  });
});

describe("record / recordedStatus", () => {
  let reportsDir: string;

  beforeEach(() => {
    reportsDir = mkdtempSync(join(tmpdir(), "vendor-validate-reports-"));
  });

  afterEach(() => {
    rmSync(reportsDir, { recursive: true, force: true });
  });

  it("reports never-ran for a tool with no recorded status", () => {
    expect(recordedStatus(reportsDir, "fake-tool")).toBe("never-ran");
  });

  it("round-trips a recorded outcome and message", () => {
    record(reportsDir, {
      tool: "fake-tool",
      artifact: "a",
      outcome: "passed",
      message: "validated a",
      output: "x",
    });
    expect(recordedStatus(reportsDir, "fake-tool")).toBe("passed: validated a");
  });

  it("overwrites a prior record for the same tool rather than appending", () => {
    record(reportsDir, {
      tool: "fake-tool",
      artifact: "a",
      outcome: "failed",
      message: "first",
      output: "",
    });
    record(reportsDir, {
      tool: "fake-tool",
      artifact: "a",
      outcome: "passed",
      message: "second",
      output: "",
    });
    expect(recordedStatus(reportsDir, "fake-tool")).toBe("passed: second");
  });
});

describe("stageFromHead", () => {
  let into: string;

  beforeEach(() => {
    into = mkdtempSync(join(tmpdir(), "vendor-validate-stage-"));
  });

  afterEach(() => {
    rmSync(into, { recursive: true, force: true });
  });

  it("extracts a real committed path from HEAD, not the working tree", (ctx) => {
    if (!committedAtHead("package.json")) {
      ctx.skip(
        "precondition absent: package.json is not committed at a git HEAD (public snapshot)",
      );
    }
    stageFromHead(REPO_ROOT, ["package.json"], into);
    expect(existsSync(join(into, "package.json"))).toBe(true);
    // Compared against `git show HEAD:...`, never the live working-tree file: that file is free
    // to differ from HEAD at test time (this very module's own CLI wiring edits it later in this
    // session), and staging FROM HEAD rather than the working tree is the exact property under
    // test.
    const atHead = execFileSync("git", ["show", "HEAD:package.json"], {
      cwd: REPO_ROOT,
      encoding: "utf-8",
    });
    expect(readFileSync(join(into, "package.json"), "utf-8")).toBe(atHead);
  });

  it("throws rather than silently staging nothing when git archive fails", () => {
    expect(() => stageFromHead(REPO_ROOT, ["this-path-does-not-exist-anywhere"], into)).toThrow();
  });
});
