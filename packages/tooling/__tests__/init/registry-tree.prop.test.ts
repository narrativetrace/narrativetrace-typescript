// SPDX-License-Identifier: BUSL-1.1
// Licensed under the Business Source License 1.1 (see LICENSE); Change Date: four years from publication; Change License: Apache-2.0
// Copyright (c) 2026 Empower Agile
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import fc from "fast-check";
import { describe, expect, test } from "vitest";
import { type Carrier, carrierBody } from "../../src/init/carrier.js";
import { reportExitCode } from "../../src/init/execution-report.js";
import { initOptions } from "../../src/init/init-options.js";
import { planExitCode, planIsEmpty } from "../../src/init/init-plan.js";
import { planInstall } from "../../src/init/init-planner.js";
import { skillPageOf } from "../../src/init/installed-skill.js";
import { applyPlan } from "../../src/init/plan-executor.js";
import { renderPlanText } from "../../src/init/plan-renderer.js";
import { readProjectState } from "../../src/init/project-state-reader.js";
import { stampProvenance } from "../../src/init/provenance.js";
import {
  installRootOf,
  SKILL_FLAVOURS,
  type SkillFlavour,
} from "../../src/init/skill-catalogue.js";
import { planUninstall } from "../../src/init/uninstall-planner.js";
import { fakeCarrier } from "./fixtures.js";
import { inATemporaryProject, linkAt, linksUnder, snapshotOf } from "./projects.js";

/**
 * The properties that have to hold for a tree the installer did NOT create: the one a registry leaves
 * behind (design D5). Every try builds a real temp project shaped like an `npx skills add` install — the
 * rendered pages of one flavour, a symbolic link at the other flavour's path, and a lock file of the
 * registry's own — and then runs the installer over it.
 *
 * FOUR tree shapes, because each has broken something in a port at some point: which flavour's path is
 * the link, crossed with whether the link is the DIRECTORY or the page inside it. Each shape is run
 * against both line endings a checkout can produce, which is the third generated dimension.
 *
 * Named after `RegistryTreePropertyTest` in the Java reference so the two lists diff. Java runs 40
 * tries per property; the same here, which covers all eight combinations many times over.
 */

/** What `npx skills add` writes at the project root; nothing of ours may touch it. */
const LOCK_FILE = '{"skills": []}\n';

/**
 * An in-memory carrier, not the checked-in one — the same reason `installer.prop.test.ts` gives: what
 * these properties are about is the ALGEBRA of adopting and replacing, and a fixture that needs no
 * repository keeps every property inside Stryker's sandbox, where the mutants these are the strongest
 * evidence against actually live. The two flavours' pages differ, which is what makes a write through a
 * link visible.
 */
const CARRIER: Carrier = fakeCarrier(["narrativetrace-doctor", "add-narrative-tracing"]);

const TRIES = 40;

function pathIn(project: string, relative: string): string {
  return join(project, ...relative.split("/"));
}

/** The link a registry makes: the directory itself, or a real directory holding a linked page. */
function link(at: string, realPage: string, linkThePage: boolean): void {
  if (!linkThePage) {
    linkAt(at, join(realPage, ".."));
    return;
  }
  mkdirSync(at, { recursive: true });
  linkAt(join(at, "SKILL.md"), realPage);
}

/**
 * One flavour's pages for real, the other flavour's path a link to them, and the lock file. The real
 * pages are this carrier's own rendering — that is what a registry installs — carrying the line ending
 * of whoever checked them out.
 */
function registryTree(
  project: string,
  linkTheVendorPath: boolean,
  linkThePage: boolean,
  eol: string,
): void {
  const real: SkillFlavour = linkTheVendorPath ? "agents" : "claude";
  const linked: SkillFlavour = linkTheVendorPath ? "claude" : "agents";
  mkdirSync(pathIn(project, installRootOf(linked)), { recursive: true });
  for (const skill of CARRIER.catalogue.skills) {
    const page = pathIn(project, skillPageOf(real, skill.name));
    mkdirSync(join(page, ".."), { recursive: true });
    writeFileSync(page, carrierBody(CARRIER, skill, real).replaceAll("\n", eol), "utf8");
    link(pathIn(project, `${installRootOf(linked)}/${skill.name}`), page, linkThePage);
  }
  writeFileSync(join(project, "skills-lock.json"), LOCK_FILE, "utf8");
}

/**
 * The assertion a write through a link would fail: every flavour's own path holds its OWN flavour's
 * stamped page, as a real file.
 */
function expectEveryPageIsItsOwnFlavour(project: string): void {
  const files = snapshotOf(project);
  for (const skill of CARRIER.catalogue.skills) {
    for (const flavour of SKILL_FLAVOURS) {
      const page = skillPageOf(flavour, skill.name);
      expect(linksUnder(project)).not.toContain(page);
      expect(files.get(page)).toBe(
        stampProvenance(carrierBody(CARRIER, skill, flavour), CARRIER.coordinate),
      );
    }
  }
}

function install(project: string) {
  const plan = planInstall(readProjectState(project), CARRIER, initOptions());
  return { plan, report: applyPlan(plan, project) };
}

/** The three dimensions, as one generator, so every property runs the same eight shapes. */
function trees() {
  return fc.tuple(fc.boolean(), fc.boolean(), fc.constantFrom("\n", "\r\n"));
}

describe("a tree a registry left behind", () => {
  /**
   * The whole of D5's promise: the pages are adopted, the link is replaced by a real path, and NOTHING
   * is written through the link — each flavour's path ends up holding its own flavour's page, which is
   * exactly what a write through the link would have destroyed.
   */
  test("is adopted without writing through its links", () => {
    fc.assert(
      fc.property(trees(), ([linkTheVendorPath, linkThePage, eol]) => {
        inATemporaryProject("nt-registry-", (project) => {
          registryTree(project, linkTheVendorPath, linkThePage, eol);

          const { plan, report } = install(project);

          expect(planExitCode(plan)).toBe(0);
          expect(reportExitCode(report)).toBe(0);
          expectEveryPageIsItsOwnFlavour(project);
          expect(snapshotOf(project).get("skills-lock.json")).toBe(LOCK_FILE);
        });
      }),
      { numRuns: TRIES },
    );
  });

  test("has nothing left to do after it has been adopted", () => {
    fc.assert(
      fc.property(trees(), ([linkTheVendorPath, linkThePage, eol]) => {
        inATemporaryProject("nt-registry-", (project) => {
          registryTree(project, linkTheVendorPath, linkThePage, eol);
          install(project);
          const adopted = snapshotOf(project);

          const second = planInstall(readProjectState(project), CARRIER, initOptions());
          applyPlan(second, project);

          expect(planIsEmpty(second), renderPlanText(second)).toBe(true);
          expect(snapshotOf(project)).toEqual(adopted);
        });
      }),
      { numRuns: TRIES },
    );
  });

  /**
   * Uninstalling gives back the registry's own tree minus the pages, which adoption made ours. The lock
   * file is the registry's and stays; a page identical to this release's was never anybody else's work
   * to keep.
   */
  test("gives back the registry's own files and no link when uninstalled", () => {
    fc.assert(
      fc.property(trees(), ([linkTheVendorPath, linkThePage, eol]) => {
        inATemporaryProject("nt-registry-", (project) => {
          registryTree(project, linkTheVendorPath, linkThePage, eol);
          install(project);

          const report = applyPlan(
            planUninstall(readProjectState(project), initOptions()),
            project,
          );

          expect(reportExitCode(report)).toBe(0);
          expect([...snapshotOf(project).keys()]).toEqual(["skills-lock.json"]);
          expect(linksUnder(project)).toEqual([]);
        });
      }),
      { numRuns: TRIES },
    );
  });
});
