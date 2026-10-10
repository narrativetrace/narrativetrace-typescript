// SPDX-License-Identifier: BUSL-1.1
// Licensed under the Business Source License 1.1 (see LICENSE); Change Date: four years from publication; Change License: Apache-2.0
// Copyright (c) 2026 Empower Agile
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, test } from "vitest";
import {
  type Action,
  adoptPage,
  createFile,
  deleteDirectory,
  deleteFile,
  refuse,
  replaceBlock,
  replaceLink,
} from "../../src/init/action.js";
import { initPlan } from "../../src/init/init-plan.js";
import { applyPlan } from "../../src/init/plan-executor.js";
import {
  renderPlan,
  renderPlanDiff,
  renderPlanJson,
  renderPlanText,
  renderReport,
  renderReportJson,
  renderReportText,
} from "../../src/init/plan-renderer.js";
import { renderUnifiedDiff } from "../../src/init/unified-diff.js";
import { FAKE_COORDINATE } from "./fixtures.js";

/**
 * What a caller shows: the summary, the diff a `--dry-run` is reviewed from, and the JSON envelope the
 * doctor already taught readers to parse.
 *
 * Named after `PlanRendererTest` in the Java reference so the two lists diff.
 */

let dir: string;

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), "nt-render-"));
});

afterEach(() => {
  rmSync(dir, { recursive: true, force: true });
});

function plan(...actions: readonly Action[]) {
  return initPlan(FAKE_COORDINATE, false, actions);
}

describe("text", () => {
  test("names the carrier and one line per action", () => {
    const text = renderPlanText(
      plan(createFile("AGENTS.md", "x\n"), refuse("CLAUDE.md", "no flag")),
    );

    expect(text).toBe(
      `narrativetrace — ${FAKE_COORDINATE}\n` +
        "2 action(s), 1 refusal(s)\n" +
        "\n" +
        "create  AGENTS.md\n" +
        "refuse  CLAUDE.md — no flag\n",
    );
  });

  test("says so when there is nothing to do", () => {
    expect(renderPlanText(plan())).toBe(`narrativetrace — ${FAKE_COORDINATE}\nnothing to do.\n`);
  });

  test("pads a kind longer than the column with one space", () => {
    expect(renderPlanText(plan(deleteDirectory(".agents/skills/a")))).toContain(
      "delete-directory .agents/skills/a\n",
    );
  });

  // Two applied against one refused, deliberately: with one of each, a counter that counts the wrong
  // status prints the same line.
  test("text of a report says what happened", () => {
    const report = applyPlan(
      plan(createFile("a.md", "a\n"), refuse("b.md", "why"), createFile("c.md", "c\n")),
      dir,
    );

    expect(renderReportText(report)).toBe(
      `narrativetrace — ${FAKE_COORDINATE}\n` +
        "2 applied, 1 refused\n" +
        "\n" +
        "applied create  a.md\n" +
        "refused refuse  b.md — why\n" +
        "applied create  c.md\n",
    );
  });

  // An adoption a person only sees in a preview is an adoption they were never told about, so both the
  // plan's text and the report's say that nothing of theirs was overwritten.
  test("says of an adoption that nothing of anybody's was overwritten", () => {
    const adopted = plan(adoptPage(".agents/skills/a/SKILL.md", "theirs\n", "ours\n"));

    expect(renderPlanText(adopted)).toContain(
      "adopt   .agents/skills/a/SKILL.md — adopted: identical to this carrier's page, so only the" +
        " provenance line is added\n",
    );
    expect(renderReportText(applyPlan(adopted, dir))).toContain(
      "applied adopt   .agents/skills/a/SKILL.md — adopted: identical to this carrier's page,",
    );
  });

  // A refusal the FILESYSTEM produced carries a detail the action itself has no idea about, so the
  // report has to print the detail rather than whatever the action's own kind would have said.
  test("text of a report prints a filesystem refusal's own detail, not the action's note", () => {
    writeFileSync(join(dir, "not-a-directory"), "x");

    const report = applyPlan(plan(deleteDirectory("not-a-directory")), dir);

    expect(renderReportText(report)).toContain("refused delete-directory not-a-directory — ");
    expect(renderReportText(report)).toContain("ENOTDIR");
  });

  test("names the link a replacement removes and what it pointed at", () => {
    const replaced = plan(
      replaceLink(".claude/skills/a", ".claude/skills/a/SKILL.md", "../../.agents/skills/a", "x\n"),
    );

    expect(renderPlanText(replaced)).toContain(
      "replace-link .claude/skills/a/SKILL.md — replaces the symbolic link .claude/skills/a →" +
        " ../../.agents/skills/a\n",
    );
    expect(renderReportText(applyPlan(replaced, dir))).toContain(
      "applied replace-link .claude/skills/a/SKILL.md — replaces the symbolic link",
    );
  });
});

describe("json", () => {
  test("of a plan is the doctor's envelope with planned actions", () => {
    const envelope = JSON.parse(
      renderPlanJson(plan(createFile("AGENTS.md", "x\n"), refuse("CLAUDE.md", "no flag"))),
    );

    expect(envelope).toEqual({
      carrier: FAKE_COORDINATE,
      actions: [
        { kind: "create", path: "AGENTS.md", status: "planned" },
        { kind: "refuse", path: "CLAUDE.md", status: "refused" },
      ],
      exitCode: 1,
    });
  });

  test("of an empty plan still carries the envelope", () => {
    expect(JSON.parse(renderPlanJson(plan()))).toEqual({
      carrier: FAKE_COORDINATE,
      actions: [],
      exitCode: 0,
    });
  });

  test("of a dry run exits zero", () => {
    const dryRun = initPlan(FAKE_COORDINATE, true, [refuse("CLAUDE.md", "no flag")]);

    expect(JSON.parse(renderPlanJson(dryRun)).exitCode).toBe(0);
  });

  test("of a report carries what happened, row for row", () => {
    const report = applyPlan(plan(createFile("a.md", "a\n"), refuse("b.md", "why")), dir);

    expect(JSON.parse(renderReportJson(report))).toEqual({
      carrier: FAKE_COORDINATE,
      actions: [
        { kind: "create", path: "a.md", status: "applied" },
        { kind: "refuse", path: "b.md", status: "refused" },
      ],
      exitCode: 1,
    });
  });

  test("escapes whatever ends up in a path or a reason", () => {
    const envelope = renderPlanJson(plan(refuse('a "quoted".md', 'because "x"\\y')));

    expect(envelope).toContain('\\"quoted\\"');
    expect(envelope).toContain("\\u0007");
    expect(JSON.parse(envelope).actions[0].path).toBe('a "quoted".md');
  });

  test("leaves a space in a path alone", () => {
    expect(JSON.parse(renderPlanJson(plan(createFile("my notes.md", "x")))).actions[0].path).toBe(
      "my notes.md",
    );
  });

  test("ends with a newline, so a shell prompt starts on its own line", () => {
    expect(renderPlanJson(plan()).endsWith("}\n")).toBe(true);
  });
});

describe("the diff", () => {
  test("of a created file comes from nowhere", () => {
    const diff = renderPlanDiff(plan(createFile("AGENTS.md", "one\ntwo\n")));

    expect(diff).toBe("--- /dev/null\n+++ b/AGENTS.md\n@@ -0,0 +1,2 @@\n+one\n+two\n");
  });

  test("of a deleted file goes nowhere", () => {
    const diff = renderPlanDiff(plan(deleteFile("AGENTS.md", "one\n")));

    expect(diff).toBe("--- a/AGENTS.md\n+++ /dev/null\n@@ -1,1 +0,0 @@\n-one\n");
  });

  test("of a replacement shows only what changed, with context", () => {
    const before = "1\n2\n3\n4\nold\n6\n7\n8\n9\n";
    const after = "1\n2\n3\n4\nnew\n6\n7\n8\n9\n";

    expect(renderUnifiedDiff("AGENTS.md", before, after)).toBe(
      "--- a/AGENTS.md\n+++ b/AGENTS.md\n@@ -2,7 +2,7 @@\n 2\n 3\n 4\n-old\n+new\n 6\n 7\n 8\n",
    );
  });

  test("marks a missing final newline on both sides", () => {
    const diff = renderUnifiedDiff("AGENTS.md", "one", "two");

    expect(diff).toContain("-one\n\\ No newline at end of file\n");
    expect(diff).toContain("+two\n\\ No newline at end of file\n");
  });

  test("shows a line-ending change rather than nothing", () => {
    expect(renderUnifiedDiff("AGENTS.md", "one\n", "one\r\n")).toContain("+one\r");
  });

  test("describes the actions that have no content", () => {
    const diff = renderPlanDiff(
      plan(deleteDirectory(".agents/skills/a"), refuse("CLAUDE.md", "no flag")),
    );

    expect(diff).toBe("# .agents/skills/a — delete-directory\n# CLAUDE.md — refused: no flag\n");
  });

  // An inserted line identical to its neighbour: the suffix scan must stop where the prefix did, or
  // the same line is counted on both sides and the hunk header stops adding up.
  test("of a line inserted beside its twin counts each side once", () => {
    const diff = renderUnifiedDiff("AGENTS.md", "a\n", "a\na\n");

    expect(diff).toBe("--- a/AGENTS.md\n+++ b/AGENTS.md\n@@ -1,1 +1,2 @@\n a\n+a\n");
  });

  test("of a line removed beside its twin counts each side once", () => {
    const diff = renderUnifiedDiff("AGENTS.md", "a\na\n", "a\n");

    expect(diff).toBe("--- a/AGENTS.md\n+++ b/AGENTS.md\n@@ -1,2 +1,1 @@\n a\n-a\n");
  });

  test("of an unchanged file is empty", () => {
    expect(renderUnifiedDiff("AGENTS.md", "same\n", "same\n")).toBe("");
    expect(renderPlanDiff(plan(replaceBlock("AGENTS.md", "same\n", "same\n")))).toBe("");
  });
});

describe("what a caller asks for", () => {
  test("a plan renders as the summary and the diff together", () => {
    const rendered = renderPlan(plan(createFile("AGENTS.md", "x\n")));

    expect(rendered).not.toContain("nothing to do.");
    expect(rendered).toContain("create  AGENTS.md");
    expect(rendered).toContain("+++ b/AGENTS.md");
  });

  test("a plan renders as nothing but the envelope when json is asked", () => {
    const rendered = renderPlan(plan(createFile("AGENTS.md", "x\n")), { json: true });

    expect(rendered).not.toContain("+++");
    expect(JSON.parse(rendered).actions).toHaveLength(1);
  });

  test("an applied run renders as its own summary or its own envelope", () => {
    const report = applyPlan(plan(createFile("a.md", "a\n")), dir);

    expect(renderReport(report)).toContain("applied create  a.md");
    expect(JSON.parse(renderReport(report, { json: true })).actions[0].status).toBe("applied");
  });

  test("refuses to render nothing", () => {
    expect(() => renderPlanText(undefined as never)).toThrow(/nothing to render/);
    expect(() => renderPlanDiff(undefined as never)).toThrow(/nothing to render/);
    expect(() => renderPlanJson(undefined as never)).toThrow(/nothing to render/);
    expect(() => renderReportText(undefined as never)).toThrow(/nothing to render/);
    expect(() => renderReportJson(undefined as never)).toThrow(/nothing to render/);
  });
});
