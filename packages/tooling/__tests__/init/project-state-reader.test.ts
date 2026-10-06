// SPDX-License-Identifier: BUSL-1.1
// Licensed under the Business Source License 1.1 (see LICENSE); Change Date: four years from publication; Change License: Apache-2.0
// Copyright (c) 2026 Empower Agile
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
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

  test("bounds how many skill directories it reads", () => {
    for (let i = 0; i < 12; i++) {
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

  test("refuses a blank output directory", () => {
    expect(() => projectState({ outputDirectory: " " })).toThrow(/where traces land/);
  });

  test("keeps its collections immutable", () => {
    const state = projectState({ installedSkills: [installedSkill("agents", "a", "foreign")] });

    expect(() => (state.installedSkills as InstalledSkill[]).push()).toThrow(TypeError);
  });
});
