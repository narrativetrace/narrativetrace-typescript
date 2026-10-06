// SPDX-License-Identifier: BUSL-1.1
// Licensed under the Business Source License 1.1 (see LICENSE); Change Date: four years from publication; Change License: Apache-2.0
// Copyright (c) 2026 Empower Agile
import { execFileSync } from "node:child_process";
import {
  cpSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

/**
 * Proves the carrier is inside the built artifact, not just in the source tree — the same point
 * Java's `SkillsCarrierJarTest` makes about its two jars (phase-3-design-2026-09-25.md D1): a real
 * `pnpm pack` tarball is opened here, never `packages/skills`/`packages/cli/skills` read back off
 * disk, so this fails the way a consumer's install would fail, not just the way a stale commit
 * would.
 *
 * The second half of the file RUNS one of those tarballs (Java's `CliExecutableJarTest`): the packed
 * CLI is unpacked into a temp project's `node_modules` beside the packed tooling library, and
 * `npx narrativetrace init --dry-run` is executed there. A carrier is a packaging promise, and only
 * running the artifact proves the promise — asserting the entries are present, which the first half
 * does, would not have caught a `files` list that ships the resources but no `dist`, a `bin` shim
 * pointing at a path the tarball does not carry, or an `import.meta.url` that resolves to the wrong
 * directory once the package is somebody else's dependency.
 *
 * Both halves live in ONE file on purpose: each `pnpm pack` runs the package's `prepack` script,
 * which writes `packages/<pkg>/LICENSE`, so two test FILES packing `cli` at the same time could read
 * that file while the other was writing it. One file is one worker, and one worker is sequential.
 */

const REPO_ROOT = join(import.meta.dirname, "..");

const CARRIER_ENTRIES = [
  "catalogue.json",
  "agents/narrativetrace-doctor/SKILL.md",
  "agents/add-narrative-tracing/SKILL.md",
  "claude/narrativetrace-doctor/SKILL.md",
  "claude/add-narrative-tracing/SKILL.md",
] as const;

function allFiles(root: string, prefix = ""): string[] {
  const files: string[] = [];
  for (const entry of readdirSync(join(root, prefix), { withFileTypes: true })) {
    const relative = prefix ? `${prefix}/${entry.name}` : entry.name;
    if (entry.isDirectory()) files.push(...allFiles(root, relative));
    else files.push(relative);
  }
  return files;
}

/** Packs `pkgDir` for real and extracts the resulting tarball; returns the extracted root. */
function packAndExtract(pkgDir: string, destRoot: string): string {
  const packDest = join(destRoot, `${pkgDir}-pack`);
  mkdirSync(packDest, { recursive: true });
  execFileSync("pnpm", ["pack", "--pack-destination", packDest], {
    cwd: join(REPO_ROOT, "packages", pkgDir),
  });
  const tarball = readdirSync(packDest).find((name) => name.endsWith(".tgz"));
  if (!tarball) throw new Error(`pnpm pack produced no .tgz in ${packDest}`);
  const extractDest = join(destRoot, `${pkgDir}-extracted`);
  mkdirSync(extractDest, { recursive: true });
  execFileSync("tar", ["xzf", join(packDest, tarball), "-C", extractDest]);
  return join(extractDest, "package");
}

/** The version the CLI package publishes at, which every page it installs is stamped with. */
function cliVersion(): string {
  return JSON.parse(readFileSync(join(REPO_ROOT, "packages/cli/package.json"), "utf-8")).version;
}

/**
 * A temp project whose `node_modules` holds the given packed packages and a linked `narrativetrace`
 * bin — the layout `npm add` would leave behind, built by hand so the test needs no registry.
 */
function consumerProject(tmp: string, packages: Readonly<Record<string, string>>): string {
  const project = join(tmp, "consumer");
  const bin = join(project, "node_modules", ".bin");
  mkdirSync(bin, { recursive: true });
  writeFileSync(join(project, "package.json"), '{"name":"consumer","private":true}\n');
  for (const [name, root] of Object.entries(packages)) {
    cpSync(root, join(project, "node_modules", "@narrativetrace", name), { recursive: true });
  }
  symlinkSync(
    join("..", "@narrativetrace", "cli", "bin", "narrativetrace.js"),
    join(bin, "narrativetrace"),
  );
  return project;
}

/** What one `npx narrativetrace …` run in that project printed, and what it exited with. */
function runPackedCli(project: string, ...args: string[]): { output: string; exitCode: number } {
  try {
    // `--no` forbids npx from installing anything: the bin has to come from this project's own
    // node_modules, which is the resolution a consumer gets and the one with no network in it.
    const output = execFileSync("npx", ["--no", "narrativetrace", ...args], {
      cwd: project,
      encoding: "utf-8",
      stdio: ["ignore", "pipe", "pipe"],
    });
    return { output, exitCode: 0 };
  } catch (failure) {
    const run = failure as { status?: number; stdout?: string; stderr?: string };
    return { output: `${run.stdout ?? ""}${run.stderr ?? ""}`, exitCode: run.status ?? -1 };
  }
}

describe("carrier packaging (Java SkillsCarrierJarTest shape)", () => {
  let skillsRoot: string;
  let cliRoot: string;
  let toolingRoot: string;
  let tmp: string;

  beforeAll(() => {
    tmp = mkdtempSync(join(tmpdir(), "nt-carrier-pack-"));
    skillsRoot = packAndExtract("skills", tmp);
    cliRoot = packAndExtract("cli", tmp);
    toolingRoot = packAndExtract("tooling", tmp);
  }, 120_000);

  afterAll(() => {
    rmSync(tmp, { recursive: true, force: true });
  });

  it("@narrativetrace/skills carries exactly the carrier entries plus package metadata", () => {
    expect(new Set(allFiles(skillsRoot))).toEqual(
      new Set([...CARRIER_ENTRIES, "package.json", "README.md", "LICENSE"]),
    );
  });

  it("@narrativetrace/skills carries no code — resources only", () => {
    expect(allFiles(skillsRoot).some((f) => /\.(ts|tsx|js|cjs|mjs)$/.test(f))).toBe(false);
  });

  it("catalogue.json names every skill exactly once and points at entries that exist", () => {
    const catalogue = JSON.parse(readFileSync(join(skillsRoot, "catalogue.json"), "utf-8"));
    expect(new Set(catalogue.skills.map((s: { name: string }) => s.name))).toEqual(
      new Set(["narrativetrace-doctor", "add-narrative-tracing"]),
    );
    for (const skill of catalogue.skills as Array<{ agents: string; claude: string }>) {
      expect(existsSync(join(skillsRoot, skill.agents))).toBe(true);
      expect(existsSync(join(skillsRoot, skill.claude))).toBe(true);
    }
  });

  it("catalogue.json carries no version literal (D2)", () => {
    expect(readFileSync(join(skillsRoot, "catalogue.json"), "utf-8")).not.toMatch(/\d+\.\d+\.\d+/);
  });

  it("@narrativetrace/cli bundles the identical carrier entries under skills/, byte for byte", () => {
    for (const entry of CARRIER_ENTRIES) {
      expect(readFileSync(join(cliRoot, "skills", entry), "utf-8")).toBe(
        readFileSync(join(skillsRoot, entry), "utf-8"),
      );
    }
  });

  it("@narrativetrace/cli carries nothing else under skills/ beyond the carrier entries", () => {
    const underSkills = allFiles(cliRoot).filter((f) => f.startsWith("skills/"));
    expect(new Set(underSkills)).toEqual(new Set(CARRIER_ENTRIES.map((e) => `skills/${e}`)));
  });

  it("@narrativetrace/cli still carries its own bin and compiled classes", () => {
    const files = allFiles(cliRoot);
    expect(files).toContain("bin/narrativetrace.js");
    expect(files.some((f) => f.startsWith("dist/"))).toBe(true);
  });

  describe("the packed CLI, run (Java CliExecutableJarTest shape)", () => {
    let project: string;

    beforeAll(() => {
      project = consumerProject(tmp, { cli: cliRoot, tooling: toolingRoot });
    });

    it("plans an install from the carrier it bundles, and writes nothing", () => {
      const run = runPackedCli(project, "init", "--dry-run");

      expect(run.exitCode).toBe(0);
      expect(run.output).toContain(`narrativetrace — @narrativetrace/skills@${cliVersion()}`);
      expect(run.output).toContain("+++ b/AGENTS.md");
      expect(run.output).toContain("+++ b/.agents/skills/narrativetrace-doctor/SKILL.md");
      expect(run.output).toContain("installed by narrativetrace init from");
      expect(existsSync(join(project, "AGENTS.md"))).toBe(false);
      expect(existsSync(join(project, ".agents"))).toBe(false);
    }, 60_000);

    it("prints the installer envelope as JSON", () => {
      const run = runPackedCli(project, "init", "--dry-run", "--json");

      expect(run.exitCode).toBe(0);
      const envelope = JSON.parse(run.output);
      expect(envelope.carrier).toBe(`@narrativetrace/skills@${cliVersion()}`);
      expect(envelope.exitCode).toBe(0);
      expect(envelope.actions.map((action: { path: string }) => action.path)).toContain(
        "AGENTS.md",
      );
    }, 60_000);

    /**
     * Through `node <bin>` rather than through npx, and the reason is a finding worth keeping: npm
     * claims a bare `--help` (and a bare `--dry-run`) that directly follows the package spec when
     * another npm flag precedes it — `npx --no <pkg> --help` prints npm exec's own usage and never
     * runs the command. Every flag of ours follows a VERB, and a verb is a positional that ends
     * npm's own flag parsing, which is why `init --dry-run` above reaches us intact.
     */
    it("lists all three verbs when the packed bin is asked how it works", () => {
      const bin = join(project, "node_modules", ".bin", "narrativetrace");
      const output = execFileSync(process.execPath, [bin, "--help"], {
        cwd: project,
        encoding: "utf-8",
      });

      expect(output).toContain("narrativetrace doctor [--json]");
      expect(output).toContain("narrativetrace init [--dry-run]");
      expect(output).toContain("narrativetrace uninstall [--dry-run]");
    }, 60_000);
  });
});
