// SPDX-License-Identifier: BUSL-1.1
// Licensed under the Business Source License 1.1 (see LICENSE); Change Date: four years from publication; Change License: Apache-2.0
// Copyright (c) 2026 Empower Agile
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, test } from "vitest";
import { isAdoptable } from "../../src/init/adoption.js";
import { carrierBody } from "../../src/init/carrier.js";
import { initOptions } from "../../src/init/init-options.js";
import { planInstall } from "../../src/init/init-planner.js";
import { skillPageOf } from "../../src/init/installed-skill.js";
import { applyPlan } from "../../src/init/plan-executor.js";
import { installedSkillAt } from "../../src/init/project-state.js";
import { readProjectState } from "../../src/init/project-state-reader.js";
import { stampProvenance } from "../../src/init/provenance.js";
import { installRootOf } from "../../src/init/skill-catalogue.js";
import { fakeCarrier, fakePage } from "./fixtures.js";
import { inATemporaryProject, linkAt, linksUnder, snapshotOf } from "./projects.js";

/**
 * Link shapes no registry produces and somebody's filesystem does anyway: a CHAIN, a link to itself, a
 * link to a plain file. The surviving findings of this milestone's adversarial pass (a cheap model wrote
 * 21 cases; these are the ones that were neither a duplicate of an existing case nor an assertion that
 * could not fail, each rewritten to assert what the source actually says).
 *
 * Every one of them has to end somewhere safe — adopted, replaced, or refused with a reason — because
 * the installer's promise is about what it will NOT do, and a shape it has no case for is a shape it
 * might do anything in.
 */

const CARRIER = fakeCarrier(["a"]);
const SKILL = CARRIER.catalogue.skills[0] as never;

function pathIn(project: string, relative: string): string {
  return join(project, ...relative.split("/"));
}

/** The real open-standard page a registry would have written, and the empty vendor root beside it. */
function registryPages(project: string, body = carrierBody(CARRIER, SKILL, "agents")): string {
  const page = pathIn(project, skillPageOf("agents", "a"));
  mkdirSync(join(page, ".."), { recursive: true });
  writeFileSync(page, body, "utf8");
  mkdirSync(pathIn(project, installRootOf("claude")), { recursive: true });
  return page;
}

describe("a link shape no registry produces", () => {
  // A byte-order mark is not a line ending. A page carrying one differs from this carrier's rendering
  // in a byte that every reader can see, so it is somebody's file and stays a refusal.
  test("a page that differs only by a byte-order mark is not adoptable", () => {
    const page = fakePage("a", "agents");

    expect(isAdoptable(`﻿${page}`, page)).toBe(false);
  });

  /**
   * A CHAIN: the vendor page links to an intermediate link, which links to our page. Reading follows
   * the whole chain, so the page IS reached and the link is replaced — and the intermediate link, which
   * is none of the installer's business, is left exactly where it was.
   */
  test("a chain of links that ends at our own page is replaced at the first link", () => {
    inATemporaryProject("nt-chain-", (project) => {
      const real = registryPages(project);
      const middle = join(project, "intermediate");
      linkAt(middle, real);
      mkdirSync(pathIn(project, `${installRootOf("claude")}/a`), { recursive: true });
      linkAt(pathIn(project, skillPageOf("claude", "a")), middle);

      const skill = installedSkillAt(readProjectState(project), "claude", "a");
      const plan = planInstall(readProjectState(project), CARRIER, initOptions());
      applyPlan(plan, project);

      expect(skill?.presence).toBe("linked-page");
      expect(skill?.link).toBe(middle);
      expect(snapshotOf(project).get(skillPageOf("claude", "a"))).toBe(
        stampProvenance(carrierBody(CARRIER, SKILL, "claude"), CARRIER.coordinate),
      );
      expect(linksUnder(project)).toEqual(["intermediate"]);
    });
  });

  /**
   * A link to ITSELF. The filesystem will not resolve it (ELOOP), so the page is reached by nobody —
   * which is the same answer a dangling link gets, and the refusal says so rather than crashing.
   */
  test("a page that links to itself reaches no page, and is refused by name", () => {
    inATemporaryProject("nt-self-", (project) => {
      const page = pathIn(project, skillPageOf("agents", "a"));
      mkdirSync(join(page, ".."), { recursive: true });
      linkAt(page, page);

      const state = readProjectState(project);
      const plan = planInstall(state, CARRIER, initOptions());

      expect(installedSkillAt(state, "agents", "a")?.presence).toBe("linked-page");
      expect(installedSkillAt(state, "agents", "a")?.body).toBe("");
      const refusal = plan.actions.find((action) => action.path === skillPageOf("agents", "a"));
      expect(refusal?.kind).toBe("refuse");
      expect(refusal?.reason).toContain("no page of narrativetrace's at the other end");
    });
  });

  /**
   * A skill DIRECTORY that is a link to a plain file. The link resolves, so a reader trusting the real
   * path alone would hand the planner that file's bytes under a skill's name — Java's adversarial pass
   * found the same hole there. The page behind it is what is read, and a file has none.
   */
  test("a skill directory linked to a plain file reaches no page, and nothing is written to it", () => {
    inATemporaryProject("nt-file-link-", (project) => {
      const file = join(project, "not-a-skill.md");
      writeFileSync(file, "a plain file somebody keeps here\n", "utf8");
      mkdirSync(pathIn(project, installRootOf("agents")), { recursive: true });
      linkAt(pathIn(project, `${installRootOf("agents")}/a`), file);

      const state = readProjectState(project);
      applyPlan(planInstall(state, CARRIER, initOptions()), project);

      expect(installedSkillAt(state, "agents", "a")?.presence).toBe("linked-directory");
      expect(installedSkillAt(state, "agents", "a")?.body).toBe("");
      expect(snapshotOf(project).get("not-a-skill.md")).toBe("a plain file somebody keeps here\n");
      expect(linksUnder(project)).toEqual([".agents/skills/a"]);
    });
  });

  /** The same shape at the page: a directory of ours holding a link to a plain file beside it. */
  test("a linked page pointing at a plain file is refused, and the file is left alone", () => {
    inATemporaryProject("nt-file-page-", (project) => {
      registryPages(project, "somebody else's notes\n");
      mkdirSync(pathIn(project, `${installRootOf("claude")}/a`), { recursive: true });
      linkAt(
        pathIn(project, skillPageOf("claude", "a")),
        pathIn(project, skillPageOf("agents", "a")),
      );

      const plan = planInstall(readProjectState(project), CARRIER, initOptions());
      applyPlan(plan, project);

      expect(snapshotOf(project).get(skillPageOf("agents", "a"))).toBe("somebody else's notes\n");
      expect(
        plan.actions.find((action) => action.path === skillPageOf("claude", "a"))?.reason,
      ).toContain("--force covers content, never a link");
    });
  });
});
