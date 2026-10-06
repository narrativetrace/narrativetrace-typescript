// SPDX-License-Identifier: BUSL-1.1
// Licensed under the Business Source License 1.1 (see LICENSE); Change Date: four years from publication; Change License: Apache-2.0
// Copyright (c) 2026 Empower Agile
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { buildSnapshot, openCarrier } from "@narrativetrace/tooling";
import { afterEach, beforeEach, describe, expect, test } from "vitest";
import { type CliDeps, runCli } from "../src/cli.js";
import { carrierFixture, FIXTURE_CARRIER, FIXTURE_SKILL } from "./fixture.js";

/**
 * `config.skills-installed` through the real launcher: a real project directory and a real carrier
 * directory, resolved by `@narrativetrace/tooling`'s own `buildSnapshot`/`resolveCarrier` — never
 * `deps.openCarrier`, which stays reserved for `init`/`uninstall` (cli.test.ts's own invariant).
 */

let project: string;
let carrierParent: string;
let carrier: string;
let out: string[];
let err: string[];

beforeEach(() => {
  project = mkdtempSync(join(tmpdir(), "nt-cli-doctor-"));
  carrierParent = mkdtempSync(join(tmpdir(), "nt-cli-doctor-carrier-"));
  carrier = carrierFixture(carrierParent);
  out = [];
  err = [];
});

afterEach(() => {
  rmSync(project, { recursive: true, force: true });
  rmSync(carrierParent, { recursive: true, force: true });
});

function deps(): CliDeps {
  return {
    cwd: project,
    env: {},
    buildSnapshot: (c, e) => buildSnapshot(c, e, carrier),
    openCarrier: (from) => openCarrier(from ?? carrier, from === undefined ? "bundled" : "from"),
    log: (message) => out.push(`${message}\n`),
    print: (text) => out.push(text),
    error: (message) => err.push(`${message}\n`),
  };
}

function resolveCoreAt(version: string): void {
  const core = join(project, "node_modules/@narrativetrace/core");
  mkdirSync(core, { recursive: true });
  writeFileSync(
    join(core, "package.json"),
    JSON.stringify({ name: "@narrativetrace/core", version }),
  );
}

interface Finding {
  readonly id: string;
  readonly status: string;
  readonly message: string;
  readonly fix: string;
}

function skillsFinding(): Finding {
  runCli(["doctor", "--json"], deps());
  const report: { findings: Finding[] } = JSON.parse(out.join(""));
  const finding = report.findings.find((f) => f.id === "config.skills-installed");
  if (finding === undefined) throw new Error("config.skills-installed did not run");
  return finding;
}

describe("config.skills-installed through the real launcher", () => {
  test("passes and says so when the project resolves no NarrativeTrace release at all", () => {
    writeFileSync(join(project, "package.json"), "{}");

    const finding = skillsFinding();

    expect(finding.status).toBe("pass");
    expect(finding.message).toContain("cannot tell");
  });

  test("fails as not installed when the project resolves a release but never ran init", () => {
    writeFileSync(join(project, "package.json"), "{}");
    resolveCoreAt("1.2.3");

    const finding = skillsFinding();

    expect(finding.status).toBe("fail");
    expect(finding.message).toContain("not installed");
    expect(finding.fix).toContain("init --dry-run");
  });

  test("passes once init has applied the carrier's pages at the project's own release", () => {
    writeFileSync(join(project, "package.json"), "{}");
    resolveCoreAt("1.2.3");
    expect(runCli(["init"], deps())).toBe(0);
    out = [];

    const finding = skillsFinding();

    expect(finding.status).toBe("pass");
  });

  test("fails as stale when the installed pages name a different release than the project", () => {
    writeFileSync(join(project, "package.json"), "{}");
    resolveCoreAt("1.2.3");
    expect(runCli(["init"], deps())).toBe(0);
    out = [];
    resolveCoreAt("9.9.9");

    const finding = skillsFinding();

    expect(finding.status).toBe("fail");
    expect(finding.message).toContain(FIXTURE_CARRIER);
    expect(finding.message).toContain("9.9.9");
  });

  test("names the missing skill when a foreign directory sits at the other's path", () => {
    writeFileSync(join(project, "package.json"), "{}");
    resolveCoreAt("1.2.3");
    mkdirSync(join(project, `.agents/skills/${FIXTURE_SKILL}`), { recursive: true });
    writeFileSync(join(project, `.agents/skills/${FIXTURE_SKILL}/SKILL.md`), "# theirs\n");

    const finding = skillsFinding();

    expect(finding.status).toBe("fail");
    expect(finding.message).toContain(FIXTURE_SKILL);
    expect(finding.message).toContain("not ours");
  });
});
