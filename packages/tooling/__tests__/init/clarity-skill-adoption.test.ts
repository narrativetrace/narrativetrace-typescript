// SPDX-License-Identifier: BUSL-1.1
// Licensed under the Business Source License 1.1 (see LICENSE); Change Date: four years from publication; Change License: Apache-2.0
// Copyright (c) 2026 Empower Agile
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, test } from "vitest";
import { checkSkillsInstalled } from "../../src/doctor/checks/skills-installed.js";
import { buildSnapshot } from "../../src/doctor/environment.js";
import {
  applyPlan,
  initOptions,
  openCarrier,
  planInstall,
  planUninstall,
  readProjectState,
  renderPlan,
} from "../../src/index.js";
import { REPO_ROOT, REPO_ROOT_REACHABLE } from "../repo-root.js";

/**
 * The clarity skill, driven through the installer, the uninstaller and the doctor the way a reader
 * meets it: the REAL checked-in carrier and the bundled copy the CLI ships, a real directory. The
 * installer is generic over the catalogue, so these pin that a fourth skill needs no machinery —
 * and the one place the project's two flavours must agree about it.
 */

const CLARITY = "add-narrativetrace-clarity";
const CARRIER_DIRECTORY = join(REPO_ROOT, "packages/skills");
const BUNDLED_DIRECTORY = join(REPO_ROOT, "packages/cli");

let project: string;

beforeEach(() => {
  project = mkdtempSync(join(tmpdir(), "nt-clarity-"));
});

afterEach(() => {
  rmSync(project, { recursive: true, force: true });
});

function install(options = initOptions()) {
  return planInstall(readProjectState(project), openCarrier(CARRIER_DIRECTORY), options);
}

/** The project resolves the release the carrier was cut from, so "current" has something to mean. */
function resolveCoreRelease(): void {
  const { version } = JSON.parse(readFileSync(join(CARRIER_DIRECTORY, "package.json"), "utf8"));
  const core = join(project, "node_modules/@narrativetrace/core");
  mkdirSync(core, { recursive: true });
  writeFileSync(
    join(core, "package.json"),
    JSON.stringify({ name: "@narrativetrace/core", version }),
  );
}

function skillsFinding() {
  resolveCoreRelease();
  return checkSkillsInstalled(buildSnapshot(project, {}, BUNDLED_DIRECTORY));
}

describe.skipIf(!REPO_ROOT_REACHABLE)("the clarity skill through the installer", () => {
  test("the dry-run preview shows its page beside the other three", () => {
    const shown = renderPlan(install(initOptions({ dryRun: true })));

    expect(shown).toContain(`+++ b/.agents/skills/${CLARITY}/SKILL.md`);
    expect(existsSync(join(project, ".agents"))).toBe(false);
  });

  test("a project that has the first three gets only the fourth on the next install", () => {
    applyPlan(install(), project);
    rmSync(join(project, ".agents/skills", CLARITY), { recursive: true });

    const paths = install().actions.map((action) => action.path);

    expect(paths).toEqual([`.agents/skills/${CLARITY}/SKILL.md`]);
  });

  test("uninstall removes its directory with the rest", () => {
    applyPlan(install(), project);
    expect(existsSync(join(project, ".agents/skills", CLARITY, "SKILL.md"))).toBe(true);

    applyPlan(planUninstall(readProjectState(project)), project);

    expect(existsSync(join(project, ".agents/skills", CLARITY))).toBe(false);
  });
});

describe.skipIf(!REPO_ROOT_REACHABLE)("the clarity skill through the doctor", () => {
  test("a project without it is told it is missing, by name", () => {
    applyPlan(install(), project);
    rmSync(join(project, ".agents/skills", CLARITY), { recursive: true });

    const finding = skillsFinding();

    expect(finding.status).toBe("fail");
    expect(finding.message).toContain(CLARITY);
  });

  test("a project with every carried skill installed passes, counting six", () => {
    applyPlan(install(), project);

    const finding = skillsFinding();

    expect(finding.status).toBe("pass");
    expect(finding.message).toContain("All 6 agent skill(s)");
  });
});
