// SPDX-License-Identifier: BUSL-1.1
// Licensed under the Business Source License 1.1 (see LICENSE); Change Date: four years from publication; Change License: Apache-2.0
// Copyright (c) 2026 Empower Agile
import { mkdirSync, readFileSync, symlinkSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { describe, expect, test } from "vitest";
import { buildSnapshot } from "../src/doctor/environment.js";
import { renderCursorRule } from "../src/init/cursor-rule.js";
import { initOptions } from "../src/init/init-options.js";
import type { InitPlan } from "../src/init/init-plan.js";
import { planRefusals } from "../src/init/init-plan.js";
import { planInstall } from "../src/init/init-planner.js";
import { scanMarkedBlocks } from "../src/init/marked-block.js";
import { applyPlan } from "../src/init/plan-executor.js";
import { projectState } from "../src/init/project-state.js";
import { readProjectState } from "../src/init/project-state-reader.js";
import { planUninstall } from "../src/init/uninstall-planner.js";
import { platformRow } from "../src/platforms/platform-row.js";
import { CURSOR_RULE_TEXT } from "../src/platforms/platform-table.js";
import { fakeCarrier } from "./init/fixtures.js";
import { inATemporaryProject, snapshotOf } from "./init/projects.js";

/**
 * Adversarial tests for Phase 8 milestone 3: the platform table as data, the Cursor rule, the
 * installer's and uninstaller's pointer decisions, the doctor's pointer verdicts, and hostile
 * on-disk shapes (a `.cursor` that is a file, a `replit.md` that is a directory, near-miss markers,
 * fences that close the wrong way, CR-only files, invalid UTF-8).
 */

const CARRIER = fakeCarrier(["a"]);
const WRITE = initOptions({ writeExisting: true });
const RULE = ".cursor/rules/narrativetrace.mdc";
const FORCE_WRITE = initOptions({ force: true, writeExisting: true });

function put(project: string, relative: string, content: string | Buffer): void {
  const file = join(project, relative);
  mkdirSync(dirname(file), { recursive: true });
  writeFileSync(file, content);
}

function stateOf(files: Record<string, string>, platforms: string[] = []) {
  return projectState({
    detectedPlatforms: new Set(platforms),
    pointerFiles: new Map(Object.entries(files)),
  });
}

function refusedPaths(plan: InitPlan): string[] {
  return planRefusals(plan).map((action) => action.path);
}

function afterOf(plan: InitPlan, path: string): string | undefined {
  return plan.actions.find((action) => action.path === path)?.after;
}

describe("a near-miss marker is user text, not a marker", () => {
  test("narrativetrace:starts is not a start marker", () => {
    expect(scanMarkedBlocks("<!-- narrativetrace:starts -->\n")).toEqual({
      regions: [],
      problems: [],
    });
  });

  test("replit.md carrying a starts near-miss is appended to, not refused", () => {
    const state = stateOf({ "replit.md": "<!-- narrativetrace:starts -->\n" }, ["replit"]);
    const plan = planInstall(state, CARRIER, WRITE);
    expect(refusedPaths(plan)).toEqual([]);
  });
});

/**
 * KNOWN GAPS, pinned with `test.fails` (they flip red the moment the gap closes, which is the cue to
 * make them plain tests): the fence and line-ending rules below mirror the Java reference's
 * `MarkedBlock` exactly, and two ports reading the same shared `AGENTS.md` differently is worse than
 * either gap — so the fix lands in the reference first and is mirrored. Each case is a documented CommonMark rule: a fence closes only with its own character, at
 * least as long, with no info string.
 */
describe("a fenced code block closes only with its own delimiter", () => {
  test.fails("a tilde line does not close a backtick fence, so a marker inside it is not read", () => {
    const text = "```md\n~~~\n<!-- narrativetrace:start -->\n<!-- narrativetrace:end -->\n```\n";
    expect(scanMarkedBlocks(text).regions).toEqual([]);
  });

  test.fails("a three-backtick line does not close a four-backtick fence", () => {
    const text = "````md\n```\n<!-- narrativetrace:start -->\n<!-- narrativetrace:end -->\n````\n";
    expect(scanMarkedBlocks(text).regions).toEqual([]);
  });

  test.fails("a fence line with an info string does not close the fence it sits in", () => {
    const text = "```\n```md\n<!-- narrativetrace:start -->\n<!-- narrativetrace:end -->\n```\n";
    expect(scanMarkedBlocks(text).regions).toEqual([]);
  });
});

describe("the created note is read only from the first line", () => {
  test("a note the user wrote lower down is kept on uninstall", () => {
    const section = "<!-- narrativetrace:start @x -->\nB\n<!-- narrativetrace:end -->\n";
    const text = `# Mine\n<!-- narrativetrace:created -->\n\n${section}`;
    const plan = planUninstall(stateOf({ "replit.md": text }, ["replit"]));
    expect(afterOf(plan, "replit.md")).toBe("# Mine\n<!-- narrativetrace:created -->\n");
  });
});

describe("a pointer path that is not a file", () => {
  test("a .cursor that is a regular file is refused, and no rule is planned under it", () => {
    inATemporaryProject("nt-phase8-m3-", (project) => {
      put(project, ".cursor", "not a directory\n");
      const plan = planInstall(readProjectState(project), CARRIER, WRITE);
      expect(refusedPaths(plan).some((path) => path.startsWith(".cursor"))).toBe(true);
      expect(plan.actions.some((action) => action.path === RULE)).toBe(false);
    });
  });

  test("a replit.md that is a directory is refused, and nothing is created over it", () => {
    inATemporaryProject("nt-phase8-m3-", (project) => {
      mkdirSync(join(project, "replit.md"));
      const plan = planInstall(readProjectState(project), CARRIER, WRITE);
      expect(refusedPaths(plan)).toContain("replit.md");
      expect(plan.actions.find((action) => action.path === "replit.md")?.kind).not.toBe("create");
    });
  });

  test("a dangling .cursor symbolic link is refused as a link, and nothing is created", () => {
    inATemporaryProject("nt-phase8-m3-", (project) => {
      symlinkSync(join(project, "nowhere"), join(project, ".cursor"));
      const plan = planInstall(readProjectState(project), CARRIER, WRITE);
      expect(
        planRefusals(plan)
          .map((action) => action.reason)
          .join("\n"),
      ).toContain("symbolic link");
      const writes = plan.actions.filter((action) => action.path.startsWith(".cursor"));
      expect(writes.map((action) => action.kind)).toEqual(["refuse"]);
    });
  });
});

describe("line endings of a file the installer appends to", () => {
  test.fails("a CR-only file gets its appended block with carriage returns, not line feeds", () => {
    const plan = planInstall(stateOf({ "replit.md": "# A\r" }, ["replit"]), CARRIER, WRITE);
    expect(afterOf(plan, "replit.md")).not.toContain("\n");
  });
});

describe("a rule file the user has edited", () => {
  test("a refreshed section keeps the user's own frontmatter and text above it", () => {
    const frontmatter = "---\ndescription: mine\nalwaysApply: false\n---\n";
    const stale = "<!-- narrativetrace:start @narrativetrace/skills@0.0.1 -->\nold\n";
    const text = `${frontmatter}${stale}<!-- narrativetrace:end -->\n`;
    const after = afterOf(planInstall(stateOf({ [RULE]: text }, ["cursor"]), CARRIER, WRITE), RULE);
    expect(after?.startsWith(frontmatter)).toBe(true);
    expect(after).not.toContain("old\n");
    expect(after).toContain(CURSOR_RULE_TEXT);
  });

  test("a section that exists only inside a fence is not ours, so install refuses", () => {
    const text = `---\nalwaysApply: true\n---\n\`\`\`\n<!-- narrativetrace:start -->\n<!-- narrativetrace:end -->\n\`\`\`\n`;
    const plan = planInstall(stateOf({ [RULE]: text }, ["cursor"]), CARRIER, WRITE);
    expect(refusedPaths(plan)).toContain(RULE);
  });
});

describe("a file ending inside an open fence", () => {
  test("replit.md is refused with --write-existing and nothing is appended into the fence", () => {
    const plan = planInstall(stateOf({ "replit.md": "```\ncode\n" }, ["replit"]), CARRIER, WRITE);
    expect(refusedPaths(plan)).toEqual(["replit.md"]);
  });
});

describe("the rule's text is validated before anything is rendered", () => {
  test("text that opens a fence is refused, because it would swallow the end marker", () => {
    expect(() => renderCursorRule("```", "@x@1")).toThrow(TypeError);
  });
});

describe("platform rows refuse values the table cannot use", () => {
  const base = {
    id: "probe",
    name: "Probe",
    markerPaths: [".probe"],
    pointer: { kind: "none", path: "" } as const,
    installPath: "install",
    agentFinds: "finds",
    evidenceLane: "probe",
    verified: "2026-10-10",
  };

  test("an empty marker path is refused, because it would detect every project", () => {
    expect(() => platformRow({ ...base, markerPaths: [""] })).toThrow();
  });

  test("a verification date that is not a real calendar date is refused", () => {
    expect(() => platformRow({ ...base, verified: "2026-13-45" })).toThrow();
  });
});

describe("the doctor's reading of a pointer that cannot be decoded", () => {
  test("a replit.md with invalid UTF-8 is still read as a pointer, not dropped silently", () => {
    inATemporaryProject("nt-phase8-m3-", (project) => {
      put(project, "replit.md", Buffer.from([0xff, 0xfe, 0x41, 0x0a]));
      const snapshot = buildSnapshot(project, {});
      expect(snapshot.pointerReadings.map((reading) => reading.platformId)).toEqual(["replit"]);
    });
  });
});

describe("install and uninstall converge", () => {
  test("a forced re-install over a finished project plans nothing", () => {
    inATemporaryProject("nt-phase8-m3-", (project) => {
      put(project, "replit.md", "# Mine\n");
      put(project, "CLAUDE.md", "# Claude\n");
      put(project, "AGENTS.md", "# Agents\n");
      put(project, ".cursor/rules/keep.txt", "x");
      applyPlan(planInstall(readProjectState(project), CARRIER, WRITE), project);
      const plan = planInstall(readProjectState(project), CARRIER, FORCE_WRITE);
      expect(plan.actions).toEqual([]);
    });
  });

  test("an empty CLAUDE.md gets the import line alone, and uninstall leaves it empty", () => {
    inATemporaryProject("nt-phase8-m3-", (project) => {
      put(project, "CLAUDE.md", "");
      applyPlan(planInstall(readProjectState(project), CARRIER, WRITE), project);
      expect(readFileSync(join(project, "CLAUDE.md"), "utf8")).toBe("@AGENTS.md\n");
      applyPlan(planUninstall(readProjectState(project)), project);
      expect(readFileSync(join(project, "CLAUDE.md"), "utf8")).toBe("");
    });
  });

  test("a second uninstall over a removed project plans nothing", () => {
    inATemporaryProject("nt-phase8-m3-", (project) => {
      put(project, "replit.md", "# Mine\n");
      applyPlan(planInstall(readProjectState(project), CARRIER, WRITE), project);
      applyPlan(planUninstall(readProjectState(project)), project);
      const before = snapshotOf(project);
      applyPlan(planUninstall(readProjectState(project)), project);
      expect(snapshotOf(project)).toEqual(before);
    });
  });
});
