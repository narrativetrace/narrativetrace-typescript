// SPDX-License-Identifier: BUSL-1.1
// Licensed under the Business Source License 1.1 (see LICENSE); Change Date: four years from publication; Change License: Apache-2.0
// Copyright (c) 2026 Empower Agile
import { describe, expect, test } from "vitest";
import { checkSkillsInstalled } from "../../src/doctor/checks/skills-installed.js";
import { installedSkill } from "../../src/init/installed-skill.js";
import { pkg, snapshot, withPackages } from "../fixture.js";

const PROJECT_VERSION = "1.2.3";
const OLDER = "0.0.1";
const CATALOGUE = ["narrativetrace-doctor", "add-narrative-tracing"];

function ours(name: string, version = PROJECT_VERSION) {
  return installedSkill("agents", name, "ours", `@narrativetrace/skills@${version}`, "page");
}

function theirs(name: string) {
  return installedSkill("agents", name, "foreign", "", "");
}

function notADirectory(name: string) {
  return installedSkill("agents", name, "not-a-directory");
}

/** A project resolving `PROJECT_VERSION` and offering `CATALOGUE`; each test adds installed skills. */
function project(overrides: Parameters<typeof snapshot>[0] = {}) {
  return snapshot({
    installedPackages: withPackages({ "@narrativetrace/core": pkg({ version: PROJECT_VERSION }) }),
    catalogueSkills: CATALOGUE,
    ...overrides,
  });
}

describe("checkSkillsInstalled", () => {
  test("passes when every catalogue skill is installed from the resolved release", () => {
    const finding = checkSkillsInstalled(
      project({ installedSkills: [ours("narrativetrace-doctor"), ours("add-narrative-tracing")] }),
    );
    expect(finding.id).toBe("config.skills-installed");
    expect(finding.status).toBe("pass");
    expect(finding.message).toBe(
      `All 2 agent skill(s) are installed and current for @narrativetrace/core@${PROJECT_VERSION}`,
    );
  });

  test("passes and says so when the carrier could not be resolved", () => {
    const finding = checkSkillsInstalled(
      project({ catalogueSkills: [], installedSkills: [ours("narrativetrace-doctor", OLDER)] }),
    );
    expect(finding.status).toBe("pass");
    expect(finding.message).toContain("cannot tell");
  });

  test("passes and says so when the project resolves no NarrativeTrace release at all", () => {
    const finding = checkSkillsInstalled(
      snapshot({ catalogueSkills: CATALOGUE, installedSkills: [] }),
    );
    expect(finding.status).toBe("pass");
    expect(finding.message).toContain("cannot tell");
  });

  test("fails when nothing is installed and names both ways to install", () => {
    const finding = checkSkillsInstalled(project());
    expect(finding.status).toBe("fail");
    expect(finding.message).toBe(
      "The NarrativeTrace agent skills are not installed under .agents/skills/",
    );
    expect(finding.fix).toBe(
      "Run `npx --yes @narrativetrace/cli init --dry-run`, read the diff, then run it without the flag.",
    );
  });

  test("fails as not installed, and joins every foreign name present, when nothing is ours", () => {
    const finding = checkSkillsInstalled(
      project({
        installedSkills: [theirs("narrativetrace-doctor"), theirs("add-narrative-tracing")],
      }),
    );
    expect(finding.status).toBe("fail");
    expect(finding.message).toBe(
      "The NarrativeTrace agent skills are not installed under .agents/skills/" +
        " — narrativetrace-doctor, add-narrative-tracing is there, not ours",
    );
  });

  // Design D5: the obvious reading of "not ours" is "somebody else's work", which invites a --force
  // nobody needs. The pages usually came from a registry, and `init` ADOPTS a page identical to this
  // release's — so the fix has to name the case and say that no flag is wanted.
  test("names the registry case in the fix when pages are there without our line", () => {
    const finding = checkSkillsInstalled(
      project({ installedSkills: [theirs("narrativetrace-doctor")] }),
    );

    expect(finding.fix).toBe(
      "Run `npx --yes @narrativetrace/cli init --dry-run`, read the diff, then run it without the" +
        " flag. Pages that are there without our line usually came from a registry (npx skills add," +
        " a plugin or workspace install). A page identical to this release's is adopted, and no" +
        " --force is needed.",
    );
  });

  test("says nothing about a registry when the paths are simply empty", () => {
    expect(checkSkillsInstalled(project()).fix).not.toContain("registry");
  });

  test("names the registry case for a link a registry left, too", () => {
    const finding = checkSkillsInstalled(
      project({
        installedSkills: [
          installedSkill("agents", "narrativetrace-doctor", "linked-directory", "", "", "../x"),
        ],
      }),
    );

    expect(finding.message).toContain("narrativetrace-doctor is there, not ours");
    expect(finding.fix).toContain("usually came from a registry");
  });

  test("fails naming both the stale stamp and what the project resolves", () => {
    const finding = checkSkillsInstalled(
      project({
        installedSkills: [
          ours("narrativetrace-doctor", OLDER),
          ours("add-narrative-tracing", OLDER),
        ],
      }),
    );
    expect(finding.status).toBe("fail");
    expect(finding.message).toBe(
      `Agent skills installed from @narrativetrace/skills@${OLDER}, project resolves ${PROJECT_VERSION}`,
    );
    expect(finding.fix).toBe(
      "Re-run `npx --yes @narrativetrace/cli init --dry-run` and apply it — the installed pages" +
        " describe a different release of NarrativeTrace than this project uses.",
    );
  });

  test("names every distinct stale stamp once, sorted", () => {
    const finding = checkSkillsInstalled(
      project({
        installedSkills: [
          installedSkill(
            "agents",
            "narrativetrace-doctor",
            "ours",
            "@narrativetrace/skills@0.0.9",
            "page",
          ),
          installedSkill(
            "agents",
            "add-narrative-tracing",
            "ours",
            "@narrativetrace/skills@0.0.2",
            "page",
          ),
        ],
      }),
    );
    expect(finding.status).toBe("fail");
    expect(finding.message).toBe(
      "Agent skills installed from @narrativetrace/skills@0.0.2, @narrativetrace/skills@0.0.9," +
        ` project resolves ${PROJECT_VERSION}`,
    );
  });

  test("fails naming the missing skill when only some are installed, with no foreign suffix", () => {
    const finding = checkSkillsInstalled(
      project({ installedSkills: [ours("narrativetrace-doctor")] }),
    );
    expect(finding.status).toBe("fail");
    expect(finding.message).toBe(
      "The agent skills are installed, but this carrier's add-narrative-tracing is missing",
    );
    expect(finding.fix).toBe(
      "Run `npx --yes @narrativetrace/cli init --dry-run` to add the missing page(s). A page" +
        " identical to this release's is adopted as it stands; --force is only for a directory" +
        " somebody else really owns.",
    );
  });

  test("joins two genuinely missing skills, sorted in catalogue order, with no foreign suffix", () => {
    const finding = checkSkillsInstalled(
      snapshot({
        installedPackages: withPackages({
          "@narrativetrace/core": pkg({ version: PROJECT_VERSION }),
        }),
        catalogueSkills: ["narrativetrace-doctor", "add-narrative-tracing", "a-third-skill"],
        installedSkills: [ours("narrativetrace-doctor")],
      }),
    );
    expect(finding.status).toBe("fail");
    expect(finding.message).toBe(
      "The agent skills are installed, but this carrier's add-narrative-tracing, a-third-skill is missing",
    );
  });

  test("a foreign directory at a skill's path is reported, and never counted", () => {
    const finding = checkSkillsInstalled(
      project({
        installedSkills: [ours("narrativetrace-doctor"), theirs("add-narrative-tracing")],
      }),
    );
    expect(finding.status).toBe("fail");
    expect(finding.message).toContain("add-narrative-tracing");
    expect(finding.message).toContain("not ours");
    expect(finding.message).not.toContain("narrativetrace-doctor");
  });

  test("a skill directory the catalogue never named is ignored", () => {
    const finding = checkSkillsInstalled(
      project({
        installedSkills: [
          ours("narrativetrace-doctor"),
          ours("add-narrative-tracing"),
          theirs("deploy-to-staging"),
        ],
      }),
    );
    expect(finding.status).toBe("pass");
    expect(finding.message).not.toContain("deploy-to-staging");
  });

  test("the vendor copy alone is not an install", () => {
    const finding = checkSkillsInstalled(
      project({
        installedSkills: [installedSkill("claude", "narrativetrace-doctor", "ours", "x", "page")],
      }),
    );
    expect(finding.status).toBe("fail");
    expect(finding.message).toContain("not installed");
  });

  test("a file where a skill directory belongs counts as missing, never as ours", () => {
    const finding = checkSkillsInstalled(
      project({
        installedSkills: [ours("narrativetrace-doctor"), notADirectory("add-narrative-tracing")],
      }),
    );
    expect(finding.status).toBe("fail");
    expect(finding.message).toContain("add-narrative-tracing");
    expect(finding.message).toContain("not ours");
  });

  test("where no skill directory exists at all, nobody else is blamed", () => {
    const finding = checkSkillsInstalled(project());
    expect(finding.message).toContain("not installed");
    expect(finding.message).not.toContain("not ours");
  });

  test("every outcome carries the same stable id and a published doc URL", () => {
    for (const s of [
      snapshot({ catalogueSkills: [], installedSkills: [] }),
      project(),
      project({ installedSkills: [ours("narrativetrace-doctor", OLDER)] }),
    ]) {
      const finding = checkSkillsInstalled(s);
      expect(finding.id).toBe("config.skills-installed");
      expect(finding.docUrl).toMatch(/^https:\/\//);
    }
  });

  test("names no fixing skill: the finding IS that the skills are absent", () => {
    expect(checkSkillsInstalled(project()).skill).toBeNull();
  });

  describe("near-miss stamps", () => {
    test("a three-part version only, with no package name at all, is stale", () => {
      const finding = checkSkillsInstalled(
        project({
          installedSkills: [
            installedSkill("agents", "narrativetrace-doctor", "ours", "1.2.3", "page"),
            installedSkill("agents", "add-narrative-tracing", "ours", "1.2.3", "page"),
          ],
        }),
      );
      expect(finding.status).toBe("fail");
      expect(finding.message).toContain("1.2.3");
    });

    test("a stamp naming another package is current when the version alone matches", () => {
      const finding = checkSkillsInstalled(
        project({
          installedSkills: [
            installedSkill(
              "agents",
              "narrativetrace-doctor",
              "ours",
              "@narrativetrace/cli@1.2.3",
              "page",
            ),
            installedSkill(
              "agents",
              "add-narrative-tracing",
              "ours",
              "@narrativetrace/cli@1.2.3",
              "page",
            ),
          ],
        }),
      );
      expect(finding.status).toBe("pass");
    });
  });
});
