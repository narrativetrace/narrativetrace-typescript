// SPDX-License-Identifier: BUSL-1.1
// Licensed under the Business Source License 1.1 (see LICENSE); Change Date: four years from publication; Change License: Apache-2.0
// Copyright (c) 2026 Empower Agile
import {
  existsSync,
  lstatSync,
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
import { openCarrier } from "@narrativetrace/tooling";
import { afterEach, beforeEach, describe, expect, test } from "vitest";
import { type CliDeps, runCli } from "../src/cli.js";
import { carrierFixture, cleanSnapshot, FIXTURE_CARRIER, FIXTURE_SKILL } from "./fixture.js";

/**
 * The two installer verbs through the launcher, against a real project directory and a real carrier
 * directory opened by `@narrativetrace/tooling`'s own `openCarrier` — the case list of Java's
 * `CliTest`, name for name, so the two suites can be read side by side.
 */

const AGENTS_PAGE = `.agents/skills/${FIXTURE_SKILL}/SKILL.md`;
const CLAUDE_PAGE = `.claude/skills/${FIXTURE_SKILL}/SKILL.md`;

/** The line `init` adds to a page it installs or adopts, for this fixture's carrier. */
const PROVENANCE = `<!-- installed by narrativetrace init from ${FIXTURE_CARRIER} — edit the catalogue, not this file -->`;

let project: string;
let carrierParent: string;
let out: string[];
let err: string[];

beforeEach(() => {
  project = mkdtempSync(join(tmpdir(), "nt-cli-init-"));
  carrierParent = mkdtempSync(join(tmpdir(), "nt-cli-carrier-"));
  out = [];
  err = [];
});

afterEach(() => {
  rmSync(project, { recursive: true, force: true });
  rmSync(carrierParent, { recursive: true, force: true });
});

function deps(overrides: Partial<CliDeps> = {}): CliDeps {
  const fixture = carrierFixture(carrierParent);
  return {
    cwd: project,
    env: {},
    buildSnapshot: () => cleanSnapshot(),
    openCarrier: (from) => openCarrier(from ?? fixture, from === undefined ? "bundled" : "from"),
    log: (message) => out.push(`${message}\n`),
    print: (text) => out.push(text),
    error: (message) => err.push(`${message}\n`),
    ...overrides,
  };
}

function stdout(): string {
  return out.join("");
}

function stderr(): string {
  return err.join("");
}

function read(relative: string): string {
  return readFileSync(join(project, relative), "utf8");
}

/** Every file under the project directory, by relative path — what an uninstall has to give back. */
function tree(directory = project, prefix = ""): Record<string, string> {
  const files: Record<string, string> = {};
  for (const entry of readdirSync(directory, { withFileTypes: true }).sort()) {
    const relative = prefix === "" ? entry.name : `${prefix}/${entry.name}`;
    if (entry.isDirectory()) Object.assign(files, tree(join(directory, entry.name), relative));
    else files[relative] = read(relative);
  }
  return files;
}

function init(...flags: string[]): number {
  return runCli(["init", ...flags], deps());
}

function uninstall(...flags: string[]): number {
  return runCli(["uninstall", ...flags], deps());
}

describe("init", () => {
  test("writes the page and the section into a fresh project, and exits 0", () => {
    const code = init();

    expect(code).toBe(0);
    expect(existsSync(join(project, AGENTS_PAGE))).toBe(true);
    expect(existsSync(join(project, "AGENTS.md"))).toBe(true);
    expect(stdout()).toContain("applied");
  });

  test("stamps every page it writes with the carrier's coordinate", () => {
    init();

    expect(read(AGENTS_PAGE)).toContain(FIXTURE_CARRIER);
  });

  test("a second run of the same carrier has nothing left to do", () => {
    init();
    out = [];

    expect(init()).toBe(0);
    expect(stdout()).toContain("0 applied");
  });

  test("--dry-run writes nothing and prints the unified diff", () => {
    const code = init("--dry-run");

    expect(code).toBe(0);
    expect(existsSync(join(project, AGENTS_PAGE))).toBe(false);
    expect(existsSync(join(project, "AGENTS.md"))).toBe(false);
    expect(stdout()).toContain("+++ b/AGENTS.md");
    expect(stdout()).toContain(`+++ b/${AGENTS_PAGE}`);
    expect(stdout()).toContain("@@");
  });

  test("--json prints the same envelope shape the doctor does", () => {
    const code = init("--json");

    expect(code).toBe(0);
    const envelope = JSON.parse(stdout());
    expect(envelope.carrier).toBe(FIXTURE_CARRIER);
    expect(envelope.exitCode).toBe(0);
    expect(envelope.actions).toEqual(
      expect.arrayContaining([{ kind: "create", path: AGENTS_PAGE, status: "applied" }]),
    );
  });

  test("--dry-run --json reports planned actions, and a refusal still exits 0", () => {
    writeFileSync(join(project, "AGENTS.md"), "# Mine\n");

    const code = init("--dry-run", "--json");

    expect(code).toBe(0);
    const envelope = JSON.parse(stdout());
    expect(envelope.exitCode).toBe(0);
    expect(envelope.actions).toEqual(
      expect.arrayContaining([{ kind: "refuse", path: "AGENTS.md", status: "refused" }]),
    );
    expect(read("AGENTS.md")).toBe("# Mine\n");
  });
});

describe("uninstall", () => {
  test("gives the project back, and never opens a carrier to do it", () => {
    init();

    const code = runCli(["uninstall"], {
      ...deps(),
      openCarrier: () => {
        throw new Error("uninstall must not open a carrier");
      },
    });

    expect(code).toBe(0);
    expect(existsSync(join(project, `.agents/skills/${FIXTURE_SKILL}`))).toBe(false);
    expect(existsSync(join(project, "AGENTS.md"))).toBe(false);
  });
});

describe("the launcher's own usage", () => {
  test("--help lists all three verbs", () => {
    expect(runCli(["--help"], deps())).toBe(0);

    expect(stdout()).toContain("doctor");
    expect(stdout()).toContain("init");
    expect(stdout()).toContain("uninstall");
  });
});

describe("init's existing-file policy", () => {
  test("refuses an AGENTS.md that is already there, names the flag, and exits 1", () => {
    writeFileSync(join(project, "AGENTS.md"), "# Mine\n");

    const code = init();

    expect(code).toBe(1);
    expect(stdout()).toContain("--write-existing");
    expect(read("AGENTS.md")).toBe("# Mine\n");
  });

  test("--write-existing appends the section under what was there", () => {
    writeFileSync(join(project, "AGENTS.md"), "# Mine\n");

    const code = init("--write-existing");

    expect(code).toBe(0);
    expect(read("AGENTS.md")).toContain("# Mine\n");
    expect(read("AGENTS.md")).toContain("<!-- narrativetrace:start ");
  });

  test("refuses a skill directory somebody else owns, and --force overwrites it", () => {
    mkdirSync(join(project, `.agents/skills/${FIXTURE_SKILL}`), { recursive: true });
    writeFileSync(join(project, AGENTS_PAGE), "# theirs\n");

    expect(init()).toBe(1);
    expect(stdout()).toContain("--force");
    expect(read(AGENTS_PAGE)).toBe("# theirs\n");
    out = [];

    expect(init("--force")).toBe(0);
    expect(read(AGENTS_PAGE)).toContain("agents body");
  });
});

describe("init's halves and vendor rule", () => {
  test("--only skills leaves the section alone", () => {
    expect(init("--only", "skills")).toBe(0);
    expect(existsSync(join(project, AGENTS_PAGE))).toBe(true);
    expect(existsSync(join(project, "AGENTS.md"))).toBe(false);
  });

  test("--only agents-md leaves the skill directories alone", () => {
    expect(init("--only", "agents-md")).toBe(0);
    expect(existsSync(join(project, AGENTS_PAGE))).toBe(false);
    expect(existsSync(join(project, "AGENTS.md"))).toBe(true);
  });

  test("--vendor claude writes the vendor copy into a project showing no sign of it", () => {
    expect(init("--vendor", "claude")).toBe(0);
    expect(read(CLAUDE_PAGE)).toContain("claude body");
  });

  test("--vendor none skips the vendor copy even where it is detected", () => {
    mkdirSync(join(project, ".claude"), { recursive: true });

    expect(init("--vendor", "none")).toBe(0);
    expect(existsSync(join(project, CLAUDE_PAGE))).toBe(false);
    expect(existsSync(join(project, AGENTS_PAGE))).toBe(true);
  });

  test("a project that looks like the vendor's gets both flavours without a flag", () => {
    mkdirSync(join(project, ".claude"), { recursive: true });

    expect(init()).toBe(0);
    expect(read(CLAUDE_PAGE)).toContain("claude body");
    expect(read(AGENTS_PAGE)).toContain("agents body");
  });
});

describe("uninstall's own flags", () => {
  test("--dry-run removes nothing", () => {
    init();
    const installed = read(AGENTS_PAGE);

    expect(uninstall("--dry-run")).toBe(0);
    expect(read(AGENTS_PAGE)).toBe(installed);
    expect(existsSync(join(project, "AGENTS.md"))).toBe(true);
  });

  test("on a project that never ran init there is nothing to do", () => {
    expect(uninstall()).toBe(0);
    expect(stdout()).toContain("0 applied");
    expect(readdirSync(project)).toEqual([]);
  });

  test("after an init that touched existing files, the tree comes back byte-identical", () => {
    writeFileSync(join(project, "CLAUDE.md"), "# Claude\n");
    writeFileSync(join(project, "README.md"), "# Read me\n");
    const before = tree();

    init("--write-existing");
    uninstall();

    expect(tree()).toEqual(before);
  });

  test("--only agents-md leaves the installed pages in place", () => {
    init();

    expect(uninstall("--only", "agents-md")).toBe(0);
    expect(existsSync(join(project, AGENTS_PAGE))).toBe(true);
    expect(existsSync(join(project, "AGENTS.md"))).toBe(false);
  });
});

describe("what each verb says about how it works", () => {
  test("init --help exits 0 and names every flag", () => {
    expect(runCli(["init", "--help"], deps())).toBe(0);

    for (const flag of [
      "--dry-run",
      "--write-existing",
      "--force",
      "--only",
      "--vendor",
      "--from",
      "--json",
    ]) {
      expect(stdout()).toContain(flag);
    }
  });

  test("init --help states that a re-run IS the refresh — there is no build hook (D8)", () => {
    runCli(["init", "-h"], deps());

    expect(stdout()).toContain("Run it again to refresh");
    expect(stdout()).toContain("installs no build hook");
  });

  test("init --help names the exit codes", () => {
    runCli(["init", "--help"], deps());

    expect(stdout()).toContain("Exit 0 = applied (or a dry run), 1 = something was refused");
  });

  test("uninstall --help exits 0 and describes only what init wrote", () => {
    expect(runCli(["uninstall", "-h"], deps())).toBe(0);

    expect(stdout()).toContain("narrativetrace uninstall");
    expect(stdout()).toContain("Never touches anything else.");
  });

  test("--help wins over a bad flag beside it, so a mistyped line can still ask", () => {
    expect(runCli(["init", "--nope", "--help"], deps())).toBe(0);
    expect(stderr()).toBe("");
  });
});

describe("the exit-2 paths: a command line nobody could act on", () => {
  test("an unknown installer option exits 2 and prints the verb's own usage", () => {
    const code = runCli(["init", "--nope"], deps());

    expect(code).toBe(2);
    expect(stderr()).toContain('unknown option: "--nope"');
    expect(stderr()).toContain("narrativetrace init [options]");
    expect(readdirSync(project)).toEqual([]);
  });

  test("a bad option value exits 2 and nothing is written", () => {
    const code = runCli(["init", "--only", "everything"], deps());

    expect(code).toBe(2);
    expect(stderr()).toContain("--only takes skills or agents-md");
    expect(readdirSync(project)).toEqual([]);
  });

  test("uninstall refuses the same bad flags, with its own usage", () => {
    expect(runCli(["uninstall", "--vendor", "cursor"], deps())).toBe(2);
    expect(stderr()).toContain("--vendor takes claude or none");
    expect(stderr()).toContain("narrativetrace uninstall [options]");
  });
});

describe("the exit-1 paths: typed correctly, could not do the work", () => {
  test("a carrier that cannot be opened exits 1 and says how to point --from at one", () => {
    const code = runCli(["init", "--from", join(carrierParent, "nowhere")], {
      ...deps(),
      openCarrier: (from) => openCarrier(from ?? ""),
    });

    expect(code).toBe(1);
    expect(stderr()).toContain("no carrier at");
    expect(stderr()).toContain("Nothing was fetched");
    expect(stderr()).toContain("--from node_modules/@narrativetrace/skills");
    expect(readdirSync(project)).toEqual([]);
  });

  test("--from is handed to the locator verbatim", () => {
    const asked: (string | undefined)[] = [];
    const fixture = carrierFixture(carrierParent);

    runCli(["init", "--from=/carriers/skills", "--dry-run"], {
      ...deps(),
      openCarrier: (from) => {
        asked.push(from);
        return openCarrier(fixture);
      },
    });

    expect(asked).toEqual(["/carriers/skills"]);
  });

  test("no --from hands the locator undefined, so its own search order decides", () => {
    const asked: (string | undefined)[] = [];
    const fixture = carrierFixture(carrierParent);

    runCli(["init", "--dry-run"], {
      ...deps(),
      openCarrier: (from) => {
        asked.push(from);
        return openCarrier(fixture);
      },
    });

    expect(asked).toEqual([undefined]);
  });

  test("a project directory that is not one exits 1, for either verb", () => {
    const gone = join(project, "gone");

    expect(runCli(["init"], { ...deps(), cwd: gone })).toBe(1);
    expect(stderr()).toContain("is not a directory");
    err = [];

    expect(runCli(["uninstall"], { ...deps(), cwd: gone })).toBe(1);
    expect(stderr()).toContain("is not a directory");
  });
});

// --- the adversarial pass: what a person types that no happy path covers -----------------------

describe("flags that fight each other, and flags a verb does not use", () => {
  test("a refusal under --json without --dry-run exits 1 and still prints one document", () => {
    writeFileSync(join(project, "AGENTS.md"), "# Mine\n");

    const code = init("--json");

    expect(code).toBe(1);
    const envelope = JSON.parse(stdout());
    expect(envelope.exitCode).toBe(1);
    expect(envelope.actions).toEqual(
      expect.arrayContaining([{ kind: "refuse", path: "AGENTS.md", status: "refused" }]),
    );
  });

  test("the last of two spellings of one flag wins", () => {
    expect(init("--only", "agents-md", "--only", "skills")).toBe(0);
    expect(existsSync(join(project, AGENTS_PAGE))).toBe(true);
    expect(existsSync(join(project, "AGENTS.md"))).toBe(false);
  });

  test("a repeated switch is idempotent, not a toggle", () => {
    expect(init("--dry-run", "--dry-run")).toBe(0);
    expect(readdirSync(project)).toEqual([]);
  });

  test("uninstall accepts the install-only flags and ignores them", () => {
    init();

    const code = runCli(["uninstall", "--force", "--write-existing", "--from", "/nowhere"], {
      ...deps(),
      openCarrier: () => {
        throw new Error("uninstall must not open a carrier");
      },
    });

    expect(code).toBe(0);
    expect(existsSync(join(project, `.agents/skills/${FIXTURE_SKILL}`))).toBe(false);
  });

  test("uninstall's usage lists only the flags it uses, and says so about the others", () => {
    runCli(["uninstall", "--help"], deps());

    expect(stdout()).toContain("--dry-run");
    expect(stdout()).toContain("--only <half>");
    expect(stdout()).toContain("--json");
    expect(stdout()).toContain("accepted and ignored");
    expect(stdout()).not.toContain("--vendor <vendor>");
  });
});

describe("a project shaped in a way the installer cannot plan against", () => {
  test("a --from that names a file rather than a directory exits 1", () => {
    const file = join(carrierParent, "not-a-carrier.txt");
    writeFileSync(file, "hello\n");

    const code = runCli(["init", "--from", file], {
      ...deps(),
      openCarrier: (from) => openCarrier(from ?? ""),
    });

    expect(code).toBe(1);
    expect(stderr()).toContain(`no carrier at ${file}`);
  });

  test("an AGENTS.md that is a directory is refused by name, and the pages still land", () => {
    mkdirSync(join(project, "AGENTS.md"), { recursive: true });

    expect(init()).toBe(1);
    expect(stdout()).toContain("refused create  AGENTS.md");
    expect(stdout()).toContain("EISDIR");
    // A refusal never stops the plan: the two halves are independent, and one file that cannot be
    // written must not cost the project the skills that can.
    expect(existsSync(join(project, AGENTS_PAGE))).toBe(true);
  });

  test("--dry-run's own text says which flag would allow each refusal", () => {
    writeFileSync(join(project, "AGENTS.md"), "# Mine\n");

    expect(init("--dry-run")).toBe(0);
    expect(stdout()).toContain("refuse");
    expect(stdout()).toContain("--write-existing");
    expect(stdout()).toContain("# AGENTS.md — refused:");
  });
});

/**
 * Design D5 through the launcher: a project that got the skills from a registry before it ever ran
 * `init`. `npx skills add` writes the open-standard pages for real and makes `.claude/skills/<name>` a
 * LINK to them. The proof of adoption is the PLAN — `init --dry-run --json` — never an exit code: a run
 * that refused everything and a run that adopted everything both exit 0 in a dry run.
 */
describe("a project a registry got the skills into first", () => {
  /** The carrier's own rendering for one flavour, which is exactly what a registry installs. */
  function rendered(flavour: "agents" | "claude"): string {
    return readFileSync(
      join(carrierFixture(carrierParent), flavour, FIXTURE_SKILL, "SKILL.md"),
      "utf8",
    );
  }

  /** The tree `npx skills add` leaves: real `agents` pages, a linked vendor path, a lock file. */
  function registryTree(page = rendered("agents")): void {
    mkdirSync(join(project, ".agents/skills", FIXTURE_SKILL), { recursive: true });
    writeFileSync(join(project, AGENTS_PAGE), page, "utf8");
    mkdirSync(join(project, ".claude/skills"), { recursive: true });
    symlinkSync(
      join(project, ".agents/skills", FIXTURE_SKILL),
      join(project, ".claude/skills", FIXTURE_SKILL),
    );
    writeFileSync(join(project, "skills-lock.json"), '{"skills": []}\n', "utf8");
  }

  test("the plan says it would adopt the pages and replace the link, with no flag", () => {
    registryTree();

    const code = init("--dry-run", "--json");

    expect(code).toBe(0);
    const envelope = JSON.parse(stdout());
    expect(envelope.actions).toEqual(
      expect.arrayContaining([
        { kind: "adopt", path: AGENTS_PAGE, status: "planned" },
        { kind: "replace-link", path: CLAUDE_PAGE, status: "planned" },
      ]),
    );
    expect(envelope.exitCode).toBe(0);
  });

  test("applying it leaves each flavour's own page and the registry's lock file untouched", () => {
    registryTree();

    expect(init()).toBe(0);
    expect(read(AGENTS_PAGE)).toBe(rendered("agents").replace("---\n\n", `---\n${PROVENANCE}\n\n`));
    expect(read(CLAUDE_PAGE)).toBe(rendered("claude").replace("---\n\n", `---\n${PROVENANCE}\n\n`));
    expect(lstatSync(join(project, CLAUDE_PAGE)).isSymbolicLink()).toBe(false);
    expect(read("skills-lock.json")).toBe('{"skills": []}\n');
  });

  test("a page from another release is refused, and the refusal names what would allow it", () => {
    registryTree(rendered("agents").replace("agents body", "another release's body"));

    const code = init("--dry-run", "--json");

    expect(code).toBe(0);
    const kinds = JSON.parse(stdout()).actions.map(
      (action: { kind: string; path: string }) => `${action.kind} ${action.path}`,
    );
    expect(kinds).toContain(`refuse .agents/skills/${FIXTURE_SKILL}`);
    expect(kinds).toContain(`refuse .claude/skills/${FIXTURE_SKILL}`);
  });

  test("a whole linked install root is one refusal, and the other flavour still installs", () => {
    mkdirSync(join(project, ".agents/skills"), { recursive: true });
    mkdirSync(join(project, ".claude"), { recursive: true });
    symlinkSync(join(project, ".agents/skills"), join(project, ".claude/skills"));

    expect(init()).toBe(1);
    expect(stdout()).toContain("refused refuse  .claude/skills");
    expect(stdout()).toContain("every skill of this flavour would be written through it");
    expect(existsSync(join(project, AGENTS_PAGE))).toBe(true);
  });
});

describe("the version guard (D4)", () => {
  /** A project that resolves its own NarrativeTrace release, the way a real consumer's does. */
  function projectResolves(version: string): void {
    const core = join(project, "node_modules/@narrativetrace/core");
    mkdirSync(core, { recursive: true });
    writeFileSync(
      join(core, "package.json"),
      JSON.stringify({ name: "@narrativetrace/core", version }),
    );
  }

  test("warns once, on stderr, when the carrier is a different release than the project", () => {
    projectResolves("9.9.9");

    const code = init();

    expect(code).toBe(0);
    expect(stderr()).toContain("@narrativetrace/skills@1.2.3");
    expect(stderr()).toContain("this project resolves NarrativeTrace 9.9.9");
    expect(stderr()).toContain("npx --yes @narrativetrace/cli@9.9.9 init");
    expect(existsSync(join(project, AGENTS_PAGE))).toBe(true);
  });

  test("the note stays off stdout, so --json is still one parseable document", () => {
    projectResolves("9.9.9");

    expect(init("--json")).toBe(0);
    expect(() => JSON.parse(stdout())).not.toThrow();
  });

  test("says nothing when the two agree", () => {
    projectResolves("1.2.3");

    expect(init()).toBe(0);
    expect(stderr()).toBe("");
  });

  test("says nothing when the project resolves no release at all", () => {
    expect(init()).toBe(0);
    expect(stderr()).toBe("");
  });

  test("a dry run warns too — it is the run a reader is about to trust", () => {
    projectResolves("9.9.9");

    expect(init("--dry-run")).toBe(0);
    expect(stderr()).toContain("resolves NarrativeTrace 9.9.9");
  });

  test("uninstall never warns: it removes what is there, whatever release wrote it", () => {
    projectResolves("9.9.9");
    init();
    err = [];

    expect(uninstall()).toBe(0);
    expect(stderr()).toBe("");
  });
});
