// SPDX-License-Identifier: BUSL-1.1
// Licensed under the Business Source License 1.1 (see LICENSE); Change Date: four years from publication; Change License: Apache-2.0
// Copyright (c) 2026 Empower Agile
import { mkdirSync, mkdtempSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, test } from "vitest";
import {
  type InstalledSkill,
  installedSkill,
  skillDirectoryOf,
  skillPageOf,
} from "../../src/init/installed-skill.js";
import {
  DEFAULT_OUTPUT_DIRECTORY,
  installedSkillAt,
  linkedInstallRootOf,
  projectState,
} from "../../src/init/project-state.js";
import { readProjectState } from "../../src/init/project-state-reader.js";
import { provenanceLine } from "../../src/init/provenance.js";

/**
 * The reader is the installer's only door to the filesystem, and the snapshot it returns is what
 * makes the planners pure. These cases pin what it reads, what it reads byte for byte, and the two
 * answers it must never confuse: a file that is absent, and a file it could not read.
 *
 * Named after `ProjectStateReaderTest` and `ProjectStateTest` in the Java reference so the lists
 * diff. Java's Gradle cases (`readsTheOutputDirectoryFromGradleProperties`, `readsTheGroovyBuildFile`,
 * `recognisesAGradleProjectBySettingsAlone`) become this runtime's own two configuration channels;
 * it has no build-tool flavour to detect, because every command the block names is the same `npx` one.
 */

const COORDINATE = "@narrativetrace/skills@1.2.3";

let dir: string;

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), "nt-state-"));
});

afterEach(() => {
  rmSync(dir, { recursive: true, force: true });
});

function write(relative: string, content: string): void {
  const file = join(dir, relative);
  mkdirSync(join(file, ".."), { recursive: true });
  writeFileSync(file, content, "utf8");
}

describe("reading a project", () => {
  test("reads an empty directory as an untouched project", () => {
    const state = readProjectState(dir);

    expect(state).toEqual(projectState());
    expect(state.agentsMd).toBeUndefined();
    expect(state.claudeMd).toBeUndefined();
    expect(state.claudeDirectory).toBe(false);
    expect(state.installedSkills).toEqual([]);
    expect(state.markedRuleFiles.size).toBe(0);
    expect(state.outputDirectory).toBe(DEFAULT_OUTPUT_DIRECTORY);
    expect(state.projectVersion).toBeUndefined();
  });

  test("reads both context files byte for byte", () => {
    write("AGENTS.md", "﻿# Title\r\n\r\nno final newline");
    write("CLAUDE.md", "@AGENTS.md  \n");

    const state = readProjectState(dir);

    expect(state.agentsMd).toBe("﻿# Title\r\n\r\nno final newline");
    expect(state.claudeMd).toBe("@AGENTS.md  \n");
  });

  test("sees the vendor directory even when it holds no skills", () => {
    mkdirSync(join(dir, ".claude"), { recursive: true });

    expect(readProjectState(dir).claudeDirectory).toBe(true);
  });

  test("reads an installed skill with its provenance coordinate", () => {
    const page = `---\nname: a\n---\n${provenanceLine(COORDINATE)}\n\nBody\n`;
    write(skillPageOf("agents", "a"), page);

    const skill = installedSkillAt(readProjectState(dir), "agents", "a");

    expect(skill).toEqual(installedSkill("agents", "a", "ours", COORDINATE, page));
    expect(skillDirectoryOf("agents", "a")).toBe(".agents/skills/a");
  });

  test("reads a skill directory without our provenance as foreign", () => {
    write(skillPageOf("agents", "a"), "---\nname: a\n---\n\nSomebody else's page\n");

    const skill = installedSkillAt(readProjectState(dir), "agents", "a");

    expect(skill?.presence).toBe("foreign");
    expect(skill?.coordinate).toBe("");
    expect(skill?.body).toContain("Somebody else's page");
  });

  test("reads a skill directory with no page at all as foreign", () => {
    mkdirSync(join(dir, skillDirectoryOf("agents", "a")), { recursive: true });

    const skill = installedSkillAt(readProjectState(dir), "agents", "a");

    expect(skill?.presence).toBe("foreign");
    expect(skill?.body).toBe("");
  });

  test("reads a file sitting where a skill directory belongs as not-a-directory", () => {
    write(skillDirectoryOf("agents", "a"), "not a directory");

    expect(installedSkillAt(readProjectState(dir), "agents", "a")?.presence).toBe(
      "not-a-directory",
    );
  });

  test("reads both flavours independently", () => {
    write(skillPageOf("agents", "a"), `---\n---\n${provenanceLine(COORDINATE)}\n`);
    write(skillPageOf("claude", "a"), "---\n---\n\nforeign\n");

    const state = readProjectState(dir);

    expect(installedSkillAt(state, "agents", "a")?.presence).toBe("ours");
    expect(installedSkillAt(state, "claude", "a")?.presence).toBe("foreign");
    expect(state.installedSkills).toHaveLength(2);
  });

  test("reads a legacy rule file only when it carries our markers", () => {
    write(".cursorrules", "<!-- narrativetrace:start -->\nx\n<!-- narrativetrace:end -->\n");
    write(".github/copilot-instructions.md", "no markers here\n");

    const state = readProjectState(dir);

    expect([...state.markedRuleFiles.keys()]).toEqual([".cursorrules"]);
  });

  test("reads a rule file whose markers do not pair up so the planner can refuse it", () => {
    write(".cursorrules", "<!-- narrativetrace:start -->\nx\n");

    expect([...readProjectState(dir).markedRuleFiles.keys()]).toEqual([".cursorrules"]);
  });

  // Written in REVERSE, so the cap is applied to a sorted listing rather than to whatever order the
  // filesystem hands back: a bound that depends on creation order reads a different five per machine.
  test("bounds how many skill directories it reads, by name and not by listing order", () => {
    for (let i = 11; i >= 0; i--) {
      write(skillPageOf("agents", `skill-${String(i).padStart(2, "0")}`), "x\n");
    }

    const state = readProjectState(dir, {}, 5);

    expect(state.installedSkills.map((skill) => skill.name)).toEqual([
      "skill-00",
      "skill-01",
      "skill-02",
      "skill-03",
      "skill-04",
    ]);
  });

  test("refuses to read a project that is not a directory", () => {
    write("file", "x");

    expect(() => readProjectState(join(dir, "file"))).toThrow(/is not a directory/);
    expect(() => readProjectState(join(dir, "nowhere"))).toThrow(/is not a directory/);
  });

  test("fails loudly when a file it must plan against cannot be read", () => {
    writeFileSync(join(dir, "AGENTS.md"), Buffer.from([0xff, 0xfe, 0xfd]));

    expect(() => readProjectState(dir)).toThrow(/AGENTS\.md/);
    expect(() => readProjectState(dir)).toThrow(/UTF-8/);
  });

  // A DIRECTORY where a file belongs is not a readable file — and not an absent one either. The
  // reader reports absent, and the executor's write is what reports the truth, because refusing to
  // plan at all would make one odd path cost a project every other action in the plan.
  test("reads a directory sitting where a context file belongs as absent", () => {
    mkdirSync(join(dir, "AGENTS.md", "held-by-a-directory"), { recursive: true });

    expect(readProjectState(dir).agentsMd).toBeUndefined();
  });
});

/**
 * What `npx skills add` leaves behind: the open-standard pages for real, and a symbolic LINK at the
 * vendor path. The reader reports a link as one and never resolves it into "a directory of ours" —
 * writing through it would land in whatever it points at, which here is the other flavour's page
 * (design D5, rule 18). This is the half the Java port got wrong first, which is why none of these
 * paths may be tested with a follow-links-by-default directory test.
 */
describe("a skill path a registry linked", () => {
  function link(at: string, to: string): void {
    mkdirSync(join(dir, at, ".."), { recursive: true });
    symlinkSync(to, join(dir, at));
  }

  test("reads a linked skill directory as linked, naming what it points at", () => {
    write(skillPageOf("agents", "a"), "---\nname: a\n---\n\nthe open-standard page\n");
    link(skillDirectoryOf("claude", "a"), join(dir, skillDirectoryOf("agents", "a")));

    const skill = installedSkillAt(readProjectState(dir), "claude", "a");

    expect(skill?.presence).toBe("linked-directory");
    expect(skill?.link).toBe(join(dir, skillDirectoryOf("agents", "a")));
    expect(skill?.body).toContain("the open-standard page");
    expect(skill?.coordinate).toBe("");
  });

  test("reads a real directory holding a linked page as a linked page", () => {
    write(skillPageOf("agents", "a"), "---\nname: a\n---\n\nthe open-standard page\n");
    link(skillPageOf("claude", "a"), join(dir, skillPageOf("agents", "a")));

    const skill = installedSkillAt(readProjectState(dir), "claude", "a");

    expect(skill?.presence).toBe("linked-page");
    expect(skill?.body).toContain("the open-standard page");
  });

  test("reads no page through a link that leaves the project", () => {
    const outside = mkdtempSync(join(tmpdir(), "nt-outside-"));
    try {
      mkdirSync(join(outside, "a"), { recursive: true });
      writeFileSync(join(outside, "a", "SKILL.md"), "not ours to read\n", "utf8");
      link(skillDirectoryOf("claude", "a"), join(outside, "a"));

      const skill = installedSkillAt(readProjectState(dir), "claude", "a");

      expect(skill?.presence).toBe("linked-directory");
      expect(skill?.body).toBe("");
    } finally {
      rmSync(outside, { recursive: true, force: true });
    }
  });

  test("reads no page through a dangling link", () => {
    link(skillDirectoryOf("claude", "a"), join(dir, ".agents/skills/nowhere"));

    expect(installedSkillAt(readProjectState(dir), "claude", "a")?.body).toBe("");
  });

  // A link CHAIN resolves, so a reader trusting the real path alone would hand the planner a plain
  // file's bytes under a skill's name. The page BEHIND the link is what is read, and a file has none.
  test("reads no page through a chain of links that ends at a plain file", () => {
    write("somewhere.md", "a plain file, not a skill directory\n");
    link(".agents/skills/middle", join(dir, "somewhere.md"));
    link(skillDirectoryOf("claude", "a"), join(dir, ".agents/skills/middle"));

    const skill = installedSkillAt(readProjectState(dir), "claude", "a");

    expect(skill?.presence).toBe("linked-directory");
    expect(skill?.body).toBe("");
  });

  // The link resolves, inside the project, to a real directory — and the page behind it is a DIRECTORY
  // too, so there is no page there at all. The reader says so rather than reporting the directory as a
  // page of nothing, and the planner's refusal is what a person then reads.
  test("reads no page through a link whose page is itself a directory", () => {
    mkdirSync(join(dir, skillPageOf("agents", "a"), "held-by-a-directory"), { recursive: true });
    link(skillDirectoryOf("claude", "a"), join(dir, skillDirectoryOf("agents", "a")));

    const skill = installedSkillAt(readProjectState(dir), "claude", "a");

    expect(skill?.presence).toBe("linked-directory");
    expect(skill?.body).toBe("");
  });

  test("reads a whole linked install root as one link and lists nothing under it", () => {
    write(skillPageOf("agents", "a"), "---\nname: a\n---\n\nthe open-standard page\n");
    link(".claude/skills", join(dir, ".agents/skills"));

    const state = readProjectState(dir);

    expect(linkedInstallRootOf(state, "claude")).toBe(join(dir, ".agents/skills"));
    expect(linkedInstallRootOf(state, "agents")).toBeUndefined();
    expect(state.installedSkills.map((skill) => skill.flavour)).toEqual(["agents"]);
  });

  // The near miss of the inside-the-project test: a sibling directory whose name has this project's
  // name as a PREFIX is not inside it, so the boundary has to be a separator and not a bare prefix.
  test("reads no page through a link into a sibling whose name starts with the project's", () => {
    const sibling = `${dir}x`;
    try {
      mkdirSync(join(sibling, "a"), { recursive: true });
      writeFileSync(join(sibling, "a", "SKILL.md"), "the sibling's page\n", "utf8");
      link(skillDirectoryOf("claude", "a"), join(sibling, "a"));

      expect(installedSkillAt(readProjectState(dir), "claude", "a")?.body).toBe("");
    } finally {
      rmSync(sibling, { recursive: true, force: true });
    }
  });

  test("reads a page sitting beside a linked sibling on its own terms", () => {
    write(skillPageOf("agents", "a"), `---\n---\n${provenanceLine(COORDINATE)}\n`);
    link(skillDirectoryOf("agents", "b"), join(dir, skillDirectoryOf("agents", "a")));

    const state = readProjectState(dir);

    expect(installedSkillAt(state, "agents", "a")?.presence).toBe("ours");
    expect(installedSkillAt(state, "agents", "b")?.presence).toBe("linked-directory");
  });
});

describe("where traces land", () => {
  test("reads the output directory from the vitest config", () => {
    write("vitest.config.ts", 'export default { test: { outputDir: "traces" } };\n');

    expect(readProjectState(dir).outputDirectory).toBe("traces");
  });

  test("reads the other config file names too", () => {
    write("vitest.config.js", 'export default { outputDir: "from-js" };\n');

    expect(readProjectState(dir).outputDirectory).toBe("from-js");
  });

  // Both directions of the near miss: a key this one is a SUFFIX of, and a key it is a PREFIX of.
  test("ignores another property and an empty value", () => {
    write(
      "vitest.config.ts",
      'export default { myOutputDir: "no", outputDirectory: "no", outputDir: "" };\n',
    );

    expect(readProjectState(dir).outputDirectory).toBe(DEFAULT_OUTPUT_DIRECTORY);
  });

  test("reads the value with no space after the colon", () => {
    write("vitest.config.ts", 'export default { outputDir:"tight" };\n');

    expect(readProjectState(dir).outputDirectory).toBe("tight");
  });

  test("reads the environment when no config file states it", () => {
    expect(readProjectState(dir, { NARRATIVETRACE_OUTPUT_DIR: "from-env" }).outputDirectory).toBe(
      "from-env",
    );
  });

  test("prefers what the config states over the environment, as the runtime does", () => {
    write("vitest.config.ts", 'export default { outputDir: "stated" };\n');

    expect(readProjectState(dir, { NARRATIVETRACE_OUTPUT_DIR: "from-env" }).outputDirectory).toBe(
      "stated",
    );
  });

  test("ignores a blank environment value", () => {
    expect(readProjectState(dir, { NARRATIVETRACE_OUTPUT_DIR: "  " }).outputDirectory).toBe(
      DEFAULT_OUTPUT_DIRECTORY,
    );
  });
});

describe("the project's own release (D4)", () => {
  test("reads the version the project resolves for the family package", () => {
    write("node_modules/@narrativetrace/core/package.json", '{"name":"x","version":"9.9.9"}');

    expect(readProjectState(dir).projectVersion).toBe("9.9.9");
  });

  test("reports no version when the project resolves nothing", () => {
    expect(readProjectState(dir).projectVersion).toBeUndefined();
  });
});

describe("the snapshot's own guards", () => {
  test("an untouched project is the default", () => {
    const state = projectState();

    expect(state.outputDirectory).toBe(DEFAULT_OUTPUT_DIRECTORY);
    expect(state.claudeDirectory).toBe(false);
  });

  test("refuses to describe the same path twice", () => {
    expect(() =>
      projectState({
        installedSkills: [
          installedSkill("agents", "a", "foreign"),
          installedSkill("agents", "a", "foreign"),
        ],
      }),
    ).toThrow(/one path once/);
  });

  test("describes the same name under two flavours without complaint", () => {
    expect(
      projectState({
        installedSkills: [
          installedSkill("agents", "a", "foreign"),
          installedSkill("claude", "a", "foreign"),
        ],
      }).installedSkills,
    ).toHaveLength(2);
  });

  test("refuses an installed skill that contradicts itself", () => {
    expect(() => installedSkill("agents", "a", "ours", "")).toThrow(/carries its coordinate/);
    // Whitespace is not a coordinate either: a stamp nobody can compare is the same as none.
    expect(() => installedSkill("agents", "a", "ours", "   ")).toThrow(/carries its coordinate/);
    expect(() => installedSkill("agents", " ", "foreign")).toThrow(/must not be blank/);
  });

  test("refuses to list anything under an install root it says is a link", () => {
    expect(() =>
      projectState({
        installedSkills: [installedSkill("claude", "a", "foreign")],
        linkedInstallRoots: new Map([["claude", "../elsewhere"]]),
      }),
    ).toThrow(/hides every skill under it/);
  });

  test("lists the other flavour's skills beside a linked root without complaint", () => {
    const state = projectState({
      installedSkills: [installedSkill("agents", "a", "foreign")],
      linkedInstallRoots: new Map([["claude", "../elsewhere"]]),
    });

    expect(linkedInstallRootOf(state, "claude")).toBe("../elsewhere");
    expect(state.installedSkills).toHaveLength(1);
  });

  test("refuses a blank output directory", () => {
    expect(() => projectState({ outputDirectory: " " })).toThrow(/where traces land/);
  });

  test("keeps its collections immutable", () => {
    const state = projectState({ installedSkills: [installedSkill("agents", "a", "foreign")] });

    expect(() => (state.installedSkills as InstalledSkill[]).push()).toThrow(TypeError);
  });
});
