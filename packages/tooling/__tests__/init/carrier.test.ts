// SPDX-License-Identifier: BUSL-1.1
// Licensed under the Business Source License 1.1 (see LICENSE); Change Date: four years from publication; Change License: Apache-2.0
// Copyright (c) 2026 Empower Agile
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, test } from "vitest";
import {
  CARRIER_COORDINATE_NAME,
  carrierBody,
  openCarrier,
  resolveCarrier,
} from "../../src/init/carrier.js";
import { REPO_ROOT, REPO_ROOT_REACHABLE } from "../repo-root.js";

/**
 * A carrier is opened once, validated whole, and then behaves as a value. These cases pin what a
 * carrier must contain to be usable at all, the coordinate it stamps everything with, and the
 * resolution order that decides which of the three homes answers.
 *
 * Named after `CarrierTest` in the Java reference so the two lists diff. Java's jar cases
 * (`opensTheSkillsJar…`, `refusesACorruptJar`) and its `~/.m2` coordinate lookup have no
 * counterpart: this port's carrier is a directory in a resolved package, and D4 rules out reading
 * the npm cache.
 */

const PAGE = "---\nname: a\ndescription: d\n---\n\nBody\n";

interface CarrierShape {
  readonly version?: string | undefined;
  readonly name?: string;
  readonly catalogue?: string;
  readonly pages?: readonly string[];
  readonly under?: string;
}

/** Writes a carrier layout under `root`, optionally inside a `skills/` subdirectory. */
function writeCarrier(root: string, shape: CarrierShape = {}): string {
  const carrierRoot = shape.under === undefined ? root : join(root, shape.under);
  mkdirSync(carrierRoot, { recursive: true });
  if (shape.version !== undefined || shape.name !== undefined) {
    writeFileSync(
      join(root, "package.json"),
      JSON.stringify({ name: shape.name ?? "@narrativetrace/skills", version: shape.version }),
    );
  }
  writeFileSync(
    join(carrierRoot, "catalogue.json"),
    shape.catalogue ??
      JSON.stringify({
        runtime: "typescript",
        skills: [
          { name: "a", description: "d", agents: "agents/a/SKILL.md", claude: "claude/a/SKILL.md" },
        ],
      }),
  );
  for (const page of shape.pages ?? ["agents/a/SKILL.md", "claude/a/SKILL.md"]) {
    const file = join(carrierRoot, page);
    mkdirSync(join(file, ".."), { recursive: true });
    writeFileSync(file, `${page}\n${PAGE}`);
  }
  return root;
}

let dir: string;

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), "nt-carrier-"));
});

afterEach(() => {
  rmSync(dir, { recursive: true, force: true });
});

describe.skipIf(!REPO_ROOT_REACHABLE)("the real checked-in carrier", () => {
  test("opens the real checked-in skills package and stamps it with that package's coordinate", () => {
    const carrier = openCarrier(join(REPO_ROOT, "packages/skills"));

    expect(carrier.coordinate).toMatch(/^@narrativetrace\/skills@\d+\.\d+\.\d+$/);
    expect(carrier.catalogue.runtime).toBe("typescript");
    expect(carrier.catalogue.skills.map((skill) => skill.name)).toEqual([
      "narrativetrace-doctor",
      "add-narrative-tracing",
      "narrativetrace-feedback",
      "add-narrativetrace-clarity",
      "narrativetrace-verify",
      "narrativetrace-debug",
    ]);
  });

  test("opens the CLI package because it bundles the same carrier", () => {
    const bundled = openCarrier(join(REPO_ROOT, "packages/cli"));
    const published = openCarrier(join(REPO_ROOT, "packages/skills"));

    expect(bundled.coordinate).toBe(published.coordinate);
    for (const skill of published.catalogue.skills) {
      expect(carrierBody(bundled, skill, "agents")).toBe(carrierBody(published, skill, "agents"));
      expect(carrierBody(bundled, skill, "claude")).toBe(carrierBody(published, skill, "claude"));
    }
  });
});

describe("opening a carrier", () => {
  test("hands out each flavour body exactly as the carrier carries it", () => {
    const carrier = openCarrier(writeCarrier(dir, { version: "1.2.3" }));
    const [skill] = carrier.catalogue.skills;
    if (!skill) throw new Error("the fixture carries one skill");

    expect(carrierBody(carrier, skill, "agents")).toBe(`agents/a/SKILL.md\n${PAGE}`);
    expect(carrierBody(carrier, skill, "claude")).toBe(`claude/a/SKILL.md\n${PAGE}`);
  });

  test("accepts a carrier at the package root or in the package's skills directory", () => {
    const atRoot = openCarrier(writeCarrier(dir, { version: "1.2.3" }));
    const nested = openCarrier(
      writeCarrier(mkdtempSync(join(tmpdir(), "nt-c2-")), {
        version: "1.2.3",
        under: "skills",
      }),
    );

    expect(nested.coordinate).toBe(atRoot.coordinate);
    expect(carrierBody(nested, nested.catalogue.skills[0] as never, "agents")).toBe(
      carrierBody(atRoot, atRoot.catalogue.skills[0] as never, "agents"),
    );
  });

  test("names the skills package on the marker even when the CLI is the home that carried it", () => {
    const carrier = openCarrier(
      writeCarrier(dir, { version: "9.9.9", name: "@narrativetrace/cli", under: "skills" }),
    );

    expect(carrier.coordinate).toBe(`${CARRIER_COORDINATE_NAME}@9.9.9`);
  });

  test("falls back to an unknown version when the manifest names none", () => {
    expect(openCarrier(writeCarrier(dir, { version: undefined })).coordinate).toBe(
      `${CARRIER_COORDINATE_NAME}@unknown`,
    );
  });

  test("falls back to an unknown version when there is no manifest beside the carrier", () => {
    writeCarrier(dir);

    expect(openCarrier(dir).coordinate).toBe(`${CARRIER_COORDINATE_NAME}@unknown`);
  });

  // A manifest whose version is blank names no version, which is the same answer as naming none at
  // all: `unknown`, visibly stale. Only a version that could not be STAMPED is a refusal.
  test("falls back to an unknown version when the manifest leaves it blank", () => {
    expect(openCarrier(writeCarrier(dir, { version: "  " })).coordinate).toBe(
      `${CARRIER_COORDINATE_NAME}@unknown`,
    );
  });
});

describe("refusals", () => {
  test("refuses a source that does not exist", () => {
    expect(() => openCarrier(join(dir, "nowhere"))).toThrow(/no carrier at/);
  });

  test("refuses a directory with no catalogue, naming where it looked", () => {
    expect(() => openCarrier(dir)).toThrow(/catalogue\.json/);
    expect(() => openCarrier(dir)).toThrow(/skills/);
  });

  test("refuses a carrier whose catalogue lists a missing file and names the entry", () => {
    writeCarrier(dir, { version: "1.2.3", pages: ["agents/a/SKILL.md"] });

    expect(() => openCarrier(dir)).toThrow(/lists a at claude\/a\/SKILL\.md/);
  });

  test("refuses a carrier whose catalogue is malformed and names the file", () => {
    writeCarrier(dir, { version: "1.2.3", catalogue: "{ not json" });

    expect(() => openCarrier(dir)).toThrow(/catalogue\.json is unusable/);
  });

  test("refuses to hand out a body for a skill the carrier does not list", () => {
    const carrier = openCarrier(writeCarrier(dir, { version: "1.2.3" }));

    expect(() =>
      carrierBody(
        carrier,
        { name: "b", description: "d", agentsPath: "x", claudePath: "y" },
        "agents",
      ),
    ).toThrow(/does not carry b/);
  });

  test("refuses a carrier page that is not UTF-8 and names the file", () => {
    writeCarrier(dir, { version: "1.2.3" });
    writeFileSync(join(dir, "agents/a/SKILL.md"), Buffer.from([0x41, 0xff, 0xfe, 0x42]));

    expect(() => openCarrier(dir)).toThrow(/agents\/a\/SKILL\.md/);
    expect(() => openCarrier(dir)).toThrow(/UTF-8/);
  });

  test.each([
    "1.2.3@4",
    "1.2/3",
    "1.2\\3",
    "..",
    "1.2 3",
  ])("refuses a version literal that cannot be stamped: %j", (version) => {
    writeCarrier(dir, { version });

    expect(() => openCarrier(dir)).toThrow(/coordinate/);
  });

  test("refuses a directory that is not one", () => {
    writeFileSync(join(dir, "file"), "x");

    expect(() => openCarrier(join(dir, "file"))).toThrow(/no carrier at/);
  });
});

describe("resolving which home answers (D4)", () => {
  function projectWithSkillsPackage(version: string): string {
    const project = mkdtempSync(join(tmpdir(), "nt-project-"));
    writeCarrier(join(project, "node_modules/@narrativetrace/skills"), { version });
    return project;
  }

  test("prefers the skills package the project resolves over the bundled copy", () => {
    const project = projectWithSkillsPackage("2.0.0");
    const bundled = writeCarrier(dir, { version: "1.0.0", under: "skills" });

    const carrier = resolveCarrier({ projectDirectory: project, bundledDirectory: bundled });

    expect(carrier.coordinate).toBe(`${CARRIER_COORDINATE_NAME}@2.0.0`);
    expect(carrier.source).toBe("project");
    rmSync(project, { recursive: true, force: true });
  });

  test("falls back to the bundled copy when the project resolves no skills package", () => {
    const project = mkdtempSync(join(tmpdir(), "nt-empty-"));
    const bundled = writeCarrier(dir, { version: "1.0.0", under: "skills" });

    const carrier = resolveCarrier({ projectDirectory: project, bundledDirectory: bundled });

    expect(carrier.coordinate).toBe(`${CARRIER_COORDINATE_NAME}@1.0.0`);
    expect(carrier.source).toBe("bundled");
    rmSync(project, { recursive: true, force: true });
  });

  test("a given path overrides both", () => {
    const project = projectWithSkillsPackage("2.0.0");
    const from = writeCarrier(mkdtempSync(join(tmpdir(), "nt-from-")), { version: "3.0.0" });

    const carrier = resolveCarrier({ projectDirectory: project, bundledDirectory: dir, from });

    expect(carrier.coordinate).toBe(`${CARRIER_COORDINATE_NAME}@3.0.0`);
    expect(carrier.source).toBe("from");
    rmSync(project, { recursive: true, force: true });
    rmSync(from, { recursive: true, force: true });
  });

  test("refuses a broken carrier in the project rather than silently using the bundled copy", () => {
    const project = mkdtempSync(join(tmpdir(), "nt-broken-"));
    writeCarrier(join(project, "node_modules/@narrativetrace/skills"), {
      version: "2.0.0",
      pages: [],
    });
    const bundled = writeCarrier(dir, { version: "1.0.0", under: "skills" });

    expect(() => resolveCarrier({ projectDirectory: project, bundledDirectory: bundled })).toThrow(
      /does not carry/,
    );
    rmSync(project, { recursive: true, force: true });
  });

  test("refuses when no home carries a carrier, naming every one it tried", () => {
    const project = mkdtempSync(join(tmpdir(), "nt-none-"));

    expect(() => resolveCarrier({ projectDirectory: project, bundledDirectory: dir })).toThrow(
      /no skills carrier/,
    );
    expect(() => resolveCarrier({ projectDirectory: project })).toThrow(/no skills carrier/);
    rmSync(project, { recursive: true, force: true });
  });

  test("a given path that is not a carrier is a failure, never a fallback", () => {
    const project = projectWithSkillsPackage("2.0.0");

    expect(() => resolveCarrier({ projectDirectory: project, from: join(dir, "nowhere") })).toThrow(
      /no carrier at/,
    );
    rmSync(project, { recursive: true, force: true });
  });
});
