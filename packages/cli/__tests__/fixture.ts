// SPDX-License-Identifier: BUSL-1.1
// Licensed under the Business Source License 1.1 (see LICENSE); Change Date: four years from publication; Change License: Apache-2.0
// Copyright (c) 2026 Empower Agile
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import type { DoctorSnapshot } from "@narrativetrace/tooling";

/**
 * The launcher's view of a doctor snapshot: enough of one to drive `runCli`, built through the
 * published type rather than through `@narrativetrace/tooling`'s own test fixture — these tests
 * are a consumer of that package, and a consumer cannot reach into its `__tests__`.
 */
export function snapshot(overrides: Partial<DoctorSnapshot> = {}): DoctorSnapshot {
  return {
    cwd: "/project",
    nodeVersion: "20.11.0",
    env: {},
    rootPackageJson: { name: "consumer", version: "1.0.0" },
    sourceFiles: new Map(),
    outputFiles: new Map(),
    approvedDirFiles: new Map(),
    installedPackages: new Map(),
    installedSkills: [],
    catalogueSkills: [],
    ...overrides,
  };
}

/**
 * A snapshot every check passes on: a passing redaction-proof test present, and no
 * traceObject/sink usage to trip the silent-sink trap. The bare {@link snapshot} default
 * deliberately has no test files, so `trap.redaction-proof` fails on it (unproven, not merely
 * absent) — which is what makes it the fixture for the launcher's exit-1 case.
 */
export function cleanSnapshot(overrides: Partial<DoctorSnapshot> = {}): DoctorSnapshot {
  return snapshot({
    sourceFiles: new Map([["src/order.test.ts", 'expect(rendered).toContain("[REDACTED]");']]),
    ...overrides,
  });
}

/** The one skill a carrier fixture carries, so a test can name the directory it lands in. */
export const FIXTURE_SKILL = "narrativetrace-doctor";

/** The version a carrier fixture stamps, so a test can assert what a page was stamped with. */
export const FIXTURE_CARRIER = "@narrativetrace/skills@1.2.3";

/**
 * Writes a real carrier directory under `parent` and returns its path — a package root holding
 * `package.json`, `catalogue.json` and one skill in both flavours.
 *
 * The launcher's tests open this with the library's own {@link openCarrier}, rather than building a
 * `Carrier` value by hand: `--from` takes a path, so the boundary a person crosses is a directory on
 * disk, and a fixture that skipped it would prove nothing about the one the CLI actually opens.
 */
export function carrierFixture(parent: string, name = FIXTURE_SKILL): string {
  const root = join(parent, "carrier-fixture");
  write(root, "package.json", JSON.stringify({ name: "@narrativetrace/skills", version: "1.2.3" }));
  const entry = {
    name,
    description: `what ${name} is for`,
    agents: page(name, "agents"),
    claude: page(name, "claude"),
  };
  write(root, "catalogue.json", JSON.stringify({ runtime: "typescript", skills: [entry] }));
  for (const flavour of ["agents", "claude"] as const) {
    write(root, page(name, flavour), `---\nname: ${name}\n---\n\n${flavour} body\n`);
  }
  return root;
}

function page(name: string, flavour: "agents" | "claude"): string {
  return `${flavour}/${name}/SKILL.md`;
}

function write(root: string, relative: string, content: string): void {
  const path = join(root, relative);
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, content);
}
