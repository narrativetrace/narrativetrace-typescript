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
import { afterEach, beforeEach, describe, expect, test } from "vitest";
import {
  createFile,
  deleteDirectory,
  deleteFile,
  refuse,
  replaceBlock,
} from "../../src/init/action.js";
import { reportExitCode, reportHasRefusals } from "../../src/init/execution-report.js";
import { initPlan } from "../../src/init/init-plan.js";
import { applyPlan } from "../../src/init/plan-executor.js";
import { FAKE_COORDINATE } from "./fixtures.js";

/**
 * The only module that writes. These cases pin that it writes exactly what the plan carries, that a
 * failure is reported rather than thrown, and that a failed write leaves what was there intact.
 *
 * Named after `PlanExecutorTest` in the Java reference so the two lists diff.
 */

let dir: string;

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), "nt-apply-"));
});

afterEach(() => {
  rmSync(dir, { recursive: true, force: true });
});

function plan(...actions: Parameters<typeof initPlan>[2]) {
  return initPlan(FAKE_COORDINATE, false, actions);
}

function read(relative: string): string {
  return readFileSync(join(dir, relative), "utf8");
}

describe("writing", () => {
  test("creates a file and every directory above it", () => {
    const report = applyPlan(plan(createFile(".agents/skills/a/SKILL.md", "page\n")), dir);

    expect(read(".agents/skills/a/SKILL.md")).toBe("page\n");
    expect(report.results[0]?.status).toBe("applied");
    expect(reportExitCode(report)).toBe(0);
  });

  test("writes exactly the bytes the plan carries", () => {
    const content = "﻿# Title\r\n\r\nno final newline";

    applyPlan(plan(createFile("AGENTS.md", content)), dir);

    expect(read("AGENTS.md")).toBe(content);
  });

  test("replaces an existing file", () => {
    writeFileSync(join(dir, "AGENTS.md"), "old\n");

    applyPlan(plan(replaceBlock("AGENTS.md", "old\n", "new\n")), dir);

    expect(read("AGENTS.md")).toBe("new\n");
  });

  test("applies what the action computed, not what is on disk", () => {
    writeFileSync(join(dir, "AGENTS.md"), "somebody changed this after the plan was made\n");

    applyPlan(plan(replaceBlock("AGENTS.md", "old\n", "new\n")), dir);

    expect(read("AGENTS.md")).toBe("new\n");
  });

  test("leaves no temporary file behind", () => {
    applyPlan(plan(createFile("AGENTS.md", "x\n")), dir);

    expect(readdirSync(dir).filter((name) => name.startsWith(".narrativetrace-"))).toEqual([]);
  });
});

describe("removing", () => {
  test("deletes a file and then its directory", () => {
    mkdirSync(join(dir, ".agents/skills/a"), { recursive: true });
    writeFileSync(join(dir, ".agents/skills/a/SKILL.md"), "page\n");

    const report = applyPlan(
      plan(deleteFile(".agents/skills/a/SKILL.md", "page\n"), deleteDirectory(".agents/skills/a")),
      dir,
    );

    expect(existsSync(join(dir, ".agents/skills/a"))).toBe(false);
    expect(report.results.every((result) => result.status === "applied")).toBe(true);
  });

  test("deleting something already gone is still applied", () => {
    const report = applyPlan(
      plan(deleteFile("gone.md", "x\n"), deleteDirectory(".agents/skills/gone")),
      dir,
    );

    expect(report.results.map((result) => result.status)).toEqual(["applied", "applied"]);
  });

  test("reports any other reason a directory will not go, naming it", () => {
    writeFileSync(join(dir, "not-a-directory"), "x");

    const report = applyPlan(plan(deleteDirectory("not-a-directory")), dir);

    expect(report.results[0]?.status).toBe("refused");
    expect(report.results[0]?.detail).toContain("ENOTDIR");
    expect(read("not-a-directory")).toBe("x");
  });

  test("leaves a directory that still holds somebody else's file and says so", () => {
    mkdirSync(join(dir, ".agents/skills/a"), { recursive: true });
    writeFileSync(join(dir, ".agents/skills/a/THEIRS.md"), "theirs\n");

    const report = applyPlan(plan(deleteDirectory(".agents/skills/a")), dir);

    expect(report.results[0]?.status).toBe("refused");
    expect(report.results[0]?.detail).toContain("is not empty");
    expect(read(".agents/skills/a/THEIRS.md")).toBe("theirs\n");
    expect(reportExitCode(report)).toBe(1);
  });
});

describe("refusals", () => {
  test("reports a refusal and writes nothing for it", () => {
    const report = applyPlan(plan(refuse("AGENTS.md", "exists and carries no section")), dir);

    expect(report.results[0]?.detail).toBe("exists and carries no section");
    expect(existsSync(join(dir, "AGENTS.md"))).toBe(false);
    expect(reportHasRefusals(report)).toBe(true);
  });

  test("a failed write leaves what was there intact and the rest of the plan runs", () => {
    mkdirSync(join(dir, "AGENTS.md/held-by-a-directory"), { recursive: true });

    const report = applyPlan(
      plan(replaceBlock("AGENTS.md", "old\n", "new\n"), createFile("other.md", "fine\n")),
      dir,
    );

    expect(report.results[0]?.status).toBe("refused");
    expect(report.results[0]?.detail).not.toBe("");
    expect(existsSync(join(dir, "AGENTS.md/held-by-a-directory"))).toBe(true);
    expect(read("other.md")).toBe("fine\n");
    expect(readdirSync(dir).filter((name) => name.startsWith(".narrativetrace-"))).toEqual([]);
  });

  test("reports the carrier and every action in plan order", () => {
    const report = applyPlan(
      plan(createFile("a.md", "a\n"), refuse("b.md", "why"), createFile("c.md", "c\n")),
      dir,
    );

    expect(report.carrier).toBe(FAKE_COORDINATE);
    expect(report.results.map((result) => result.action.path)).toEqual(["a.md", "b.md", "c.md"]);
    expect(report.results.map((result) => result.status)).toEqual([
      "applied",
      "refused",
      "applied",
    ]);
  });
});

describe("what it will not do", () => {
  test("an empty plan applies cleanly", () => {
    const report = applyPlan(plan(), dir);

    expect(report.results).toEqual([]);
    expect(reportExitCode(report)).toBe(0);
  });

  test("refuses to apply a dry-run plan", () => {
    expect(() => applyPlan(initPlan(FAKE_COORDINATE, true, []), dir)).toThrow(
      /dry run is shown, never applied/,
    );
  });

  test("refuses to apply to something that is not a directory", () => {
    writeFileSync(join(dir, "file"), "x");

    expect(() => applyPlan(plan(), join(dir, "file"))).toThrow(/is not a directory/);
    expect(() => applyPlan(plan(), join(dir, "nowhere"))).toThrow(/is not a directory/);
    expect(() => applyPlan(undefined as never, dir)).toThrow(TypeError);
    expect(() => applyPlan(plan(), undefined as never)).toThrow(TypeError);
  });

  test("a refused outcome always carries a reason", () => {
    const report = applyPlan(plan(refuse("a.md", "why")), dir);

    expect(report.results[0]?.detail).not.toBe("");
  });
});
