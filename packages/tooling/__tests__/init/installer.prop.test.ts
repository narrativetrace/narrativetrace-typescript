// SPDX-License-Identifier: BUSL-1.1
// Licensed under the Business Source License 1.1 (see LICENSE); Change Date: four years from publication; Change License: Apache-2.0
// Copyright (c) 2026 Empower Agile
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import fc from "fast-check";
import { describe, expect, test } from "vitest";
import { isFileEdit } from "../../src/init/action.js";
import type { Carrier } from "../../src/init/carrier.js";
import { initOptions } from "../../src/init/init-options.js";
import type { InitPlan } from "../../src/init/init-plan.js";
import { planInstall } from "../../src/init/init-planner.js";
import { eolOf } from "../../src/init/marked-block.js";
import { applyPlan } from "../../src/init/plan-executor.js";
import { readProjectState } from "../../src/init/project-state-reader.js";
import { planUninstall } from "../../src/init/uninstall-planner.js";
import { fakeCarrier } from "./fixtures.js";
import { inATemporaryProject as inATemporaryOne, snapshotOf } from "./projects.js";

/**
 * The properties an installer has to hold for files nobody wrote by hand: planning after applying finds
 * nothing left to do, installing and then uninstalling gives the project back, a plan never touches one
 * path twice, and what the plan promised is what the files say. Each runs against a real temporary
 * directory, because "apply" is only meaningful against a filesystem.
 *
 * Named after `InstallerPropertyTest` in the Java reference so the two lists diff. Java runs 200 tries
 * per property; 100 here, which is what keeps this file inside the per-package test budget while still
 * covering every shape the generators can produce many times over.
 */

const PERMISSIVE = initOptions({ writeExisting: true, force: true });
const RUNS = 100;

/**
 * An in-memory carrier, not the checked-in one: what these properties are about is the ALGEBRA of
 * planning and applying, which the two rendered pages' own content has no part in — and a fixture that
 * needs no repository keeps every property inside Stryker's sandbox, where the mutants these are the
 * strongest evidence against actually live.
 */
const CARRIER: Carrier = fakeCarrier(["narrativetrace-doctor", "add-narrative-tracing"]);

/** Context files as they come: markers, fences, import lines, byte-order marks, no final newline. */
const contextFile = (): fc.Arbitrary<string> =>
  assemble([
    "# Title",
    "",
    "some prose about the project",
    "```",
    "@AGENTS.md",
    "@AGENTS.md   ",
    "  <!-- narrativetrace:start -->",
    "<!-- narrativetrace:start @narrativetrace/skills@0.0.1 -->",
    "<!-- narrativetrace:end -->",
    "<!-- narrativetrace:created -->",
    "<!-- narrativetrace:skills:start -->",
  ]);

/** The same, minus anything of ours: the shape the round trip is defined for. */
const untouchedContextFile = (): fc.Arbitrary<string> =>
  assemble([
    "# Title",
    "",
    "some prose about the project",
    "```",
    "  indented",
    "<!-- an unrelated comment -->",
    "@SOMETHING.md",
    "tail",
  ]);

/** Joins lines with one of the two line endings, sometimes dropping the final newline or adding a BOM. */
function assemble(pool: readonly string[]): fc.Arbitrary<string> {
  return fc
    .tuple(
      fc.array(fc.constantFrom(...pool), { maxLength: 10 }),
      fc.constantFrom("\n", "\r\n"),
      fc.boolean(),
      fc.boolean(),
    )
    .map(([lines, eol, finalNewline, bom]) => {
      if (lines.length === 0) return "";
      const joined = lines.join(eol) + (finalNewline ? eol : "");
      return bom ? `﻿${joined}` : joined;
    });
}

function inATemporaryProject(body: (project: string) => void): void {
  inATemporaryOne("nt-prop-", body);
}

function write(project: string, name: string, content: string): void {
  writeFileSync(join(project, name), content, "utf8");
}

function edits(plan: InitPlan) {
  return plan.actions.filter(isFileEdit);
}

function endingWithNewline(text: string): string {
  return text.endsWith("\n") ? text : text + eolOf(text);
}

describe("the installer's properties", () => {
  /**
   * Planning, applying and planning again leaves no work. A refusal may repeat — it is a decision about a
   * file, not a change to one — so what must be empty is the set of EDITS.
   */
  test("planning after applying finds nothing left to do", () => {
    fc.assert(
      fc.property(contextFile(), contextFile(), (agentsMd, claudeMd) => {
        inATemporaryProject((project) => {
          write(project, "AGENTS.md", agentsMd);
          write(project, "CLAUDE.md", claudeMd);

          applyPlan(planInstall(readProjectState(project), CARRIER, PERMISSIVE), project);
          const second = planInstall(readProjectState(project), CARRIER, PERMISSIVE);

          expect(edits(second)).toEqual([]);
        });
      }),
      { numRuns: RUNS },
    );
  });

  /**
   * Installing and then uninstalling gives the project back. The one documented difference: a file the
   * installer appended to is left ending with a newline, because a block has to start on its own line and
   * nothing records that the file lacked one.
   */
  test("installing then uninstalling leaves the project as it was", () => {
    fc.assert(
      fc.property(untouchedContextFile(), untouchedContextFile(), (agentsMd, claudeMd) => {
        inATemporaryProject((project) => {
          write(project, "AGENTS.md", agentsMd);
          write(project, "CLAUDE.md", claudeMd);
          const before = snapshotOf(project);

          applyPlan(planInstall(readProjectState(project), CARRIER, PERMISSIVE), project);
          applyPlan(planUninstall(readProjectState(project), PERMISSIVE), project);

          const after = snapshotOf(project);
          expect([...after.keys()].sort()).toEqual([...before.keys()].sort());
          for (const [path, content] of after) {
            const original = before.get(path) as string;
            expect([original, endingWithNewline(original)]).toContain(content);
          }
        });
      }),
      { numRuns: RUNS },
    );
  });

  test("a plan never touches one path twice", () => {
    fc.assert(
      fc.property(contextFile(), contextFile(), (agentsMd, claudeMd) => {
        inATemporaryProject((project) => {
          write(project, "AGENTS.md", agentsMd);
          write(project, "CLAUDE.md", claudeMd);
          mkdirSync(join(project, ".claude"), { recursive: true });

          const install = planInstall(readProjectState(project), CARRIER, PERMISSIVE);
          applyPlan(install, project);
          const uninstall = planUninstall(readProjectState(project), PERMISSIVE);

          for (const plan of [install, uninstall]) {
            const paths = plan.actions.map((action) => action.path);
            expect(new Set(paths).size).toBe(paths.length);
          }
        });
      }),
      { numRuns: RUNS },
    );
  });

  test("what was planned is what the files say", () => {
    fc.assert(
      fc.property(contextFile(), (agentsMd) => {
        inATemporaryProject((project) => {
          write(project, "AGENTS.md", agentsMd);

          const plan = planInstall(readProjectState(project), CARRIER, PERMISSIVE);
          applyPlan(plan, project);

          for (const edit of edits(plan)) {
            const file = join(project, ...edit.path.split("/"));
            expect(existsSync(file) ? readFileSync(file, "utf8") : "").toBe(edit.after);
          }
        });
      }),
      { numRuns: RUNS },
    );
  });
});
