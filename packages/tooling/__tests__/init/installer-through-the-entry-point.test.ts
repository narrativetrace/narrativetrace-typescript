// SPDX-License-Identifier: BUSL-1.1
// Licensed under the Business Source License 1.1 (see LICENSE); Change Date: four years from publication; Change License: Apache-2.0
// Copyright (c) 2026 Empower Agile
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, test } from "vitest";
import {
  applyPlan,
  type InitPlan,
  initOptions,
  openCarrier,
  planExitCode,
  planInstall,
  planUninstall,
  readProjectState,
  renderPlan,
  reportExitCode,
} from "../../src/index.js";
import { REPO_ROOT, REPO_ROOT_REACHABLE } from "../repo-root.js";

/**
 * The whole installer driven the way an entry point will drive it — through the package's public
 * surface, against a real directory, with the REAL checked-in carrier. Every other test in this package
 * reaches into a module; this one is a consumer.
 *
 * Mirrors `consumer/InstallerFromAnotherPackageTest` in the Java reference.
 */

const CARRIER_DIRECTORY = join(REPO_ROOT, "packages/skills");

let project: string;

beforeEach(() => {
  project = mkdtempSync(join(tmpdir(), "nt-consumer-"));
});

afterEach(() => {
  rmSync(project, { recursive: true, force: true });
});

function read(relative: string): string {
  return readFileSync(join(project, relative), "utf8");
}

function install(options = initOptions()): InitPlan {
  const carrier = openCarrier(CARRIER_DIRECTORY);
  return planInstall(readProjectState(project), carrier, options);
}

describe.skipIf(!REPO_ROOT_REACHABLE)("an install driven from outside the package", () => {
  test("previews, then applies exactly what the preview showed", () => {
    const preview = install(initOptions({ dryRun: true }));
    const shown = renderPlan(preview);

    expect(planExitCode(preview)).toBe(0);
    expect(shown).toContain("+++ b/.agents/skills/narrativetrace-doctor/SKILL.md");
    expect(shown).toContain("+++ b/AGENTS.md");
    expect(existsSync(join(project, "AGENTS.md"))).toBe(false);

    const report = applyPlan(install(), project);

    expect(reportExitCode(report)).toBe(0);
    for (const action of preview.actions) {
      expect(read(action.path)).toBe(action.after);
    }
  });

  test("a second install of the same carrier has nothing left to do", () => {
    applyPlan(install(), project);

    expect(install().actions).toEqual([]);
  });

  test("uninstall gives the project back, and the pages it wrote are gone", () => {
    applyPlan(install(), project);
    expect(existsSync(join(project, ".agents/skills/narrativetrace-doctor/SKILL.md"))).toBe(true);

    const removal = applyPlan(planUninstall(readProjectState(project)), project);

    expect(reportExitCode(removal)).toBe(0);
    expect(existsSync(join(project, ".agents/skills/narrativetrace-doctor"))).toBe(false);
    expect(existsSync(join(project, "AGENTS.md"))).toBe(false);
  });

  test("the vendor flavour lands too where the project looks like that vendor's", () => {
    writeFileSync(join(project, "CLAUDE.md"), "# Rules\n");
    mkdirSync(join(project, ".claude"), { recursive: true });

    applyPlan(install(initOptions({ writeExisting: true })), project);

    expect(read(".claude/skills/narrativetrace-doctor/SKILL.md")).toContain("narrativetrace init");
    expect(read("CLAUDE.md")).toBe("# Rules\n\n@AGENTS.md\n");
  });

  test("a project that says no is left alone, and the run says which flag would change that", () => {
    writeFileSync(join(project, "AGENTS.md"), "# My own instructions\n");

    const plan = install();
    const report = applyPlan(plan, project);

    expect(planExitCode(plan)).toBe(1);
    expect(reportExitCode(report)).toBe(1);
    expect(read("AGENTS.md")).toBe("# My own instructions\n");
    expect(renderPlan(plan)).toContain("--write-existing");
  });
});
