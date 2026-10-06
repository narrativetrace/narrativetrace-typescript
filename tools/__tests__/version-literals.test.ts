// SPDX-License-Identifier: BUSL-1.1
// Licensed under the Business Source License 1.1 (see LICENSE); Change Date: four years from publication; Change License: Apache-2.0
// Copyright (c) 2026 Empower Agile
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import fc from "fast-check";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { gitBlobHash12 } from "../translation-check-discovery.js";
import { check, sync } from "../version-literals.js";

const REPO_VERSION = "0.2.4";

describe("version-literals", () => {
  let root: string;

  beforeEach(() => {
    root = mkdtempSync(join(tmpdir(), "version-literals-test-"));
    mkdirSync(join(root, "documentation"), { recursive: true });
  });

  afterEach(() => {
    rmSync(root, { recursive: true, force: true });
  });

  function guide(content: string): string {
    const path = join(root, "documentation", "guide.md");
    writeFileSync(path, content, "utf-8");
    return path;
  }

  function read(relativePath: string): string {
    return readFileSync(join(root, relativePath), "utf-8");
  }

  describe("sync — the only writer", () => {
    it("rewrites an npm spec coordinate to the repository's version", () => {
      guide("Run `npm add @narrativetrace/core-node@0.1.1`.\n");

      sync(root, REPO_VERSION);

      expect(read("documentation/guide.md")).toBe(
        `Run \`npm add @narrativetrace/core-node@${REPO_VERSION}\`.\n`,
      );
    });

    it("rewrites a package.json dependency coordinate and keeps the author's range prefix", () => {
      guide('    "@narrativetrace/proxy": "^0.1.1",\n');

      sync(root, REPO_VERSION);

      expect(read("documentation/guide.md")).toBe(
        `    "@narrativetrace/proxy": "^${REPO_VERSION}",\n`,
      );
    });

    it("rewrites every coordinate on one line, not just the first", () => {
      guide("`npm add @narrativetrace/core@0.1.1 @narrativetrace/proxy@0.1.1`\n");

      sync(root, REPO_VERSION);

      expect(read("documentation/guide.md")).toBe(
        `\`npm add @narrativetrace/core@${REPO_VERSION} @narrativetrace/proxy@${REPO_VERSION}\`\n`,
      );
    });

    it("rewrites a translated mirror too — an install coordinate is language-neutral", () => {
      mkdirSync(join(root, "documentation", "es"));
      writeFileSync(
        join(root, "documentation", "es", "guia.md"),
        "Ejecuta `npm add @narrativetrace/core@0.1.1`.\n",
        "utf-8",
      );

      sync(root, REPO_VERSION);

      expect(read("documentation/es/guia.md")).toBe(
        `Ejecuta \`npm add @narrativetrace/core@${REPO_VERSION}\`.\n`,
      );
    });

    it("leaves a third-party coordinate alone", () => {
      guide("`npm add pino@9.0.0`\n");

      sync(root, REPO_VERSION);

      expect(read("documentation/guide.md")).toBe("`npm add pino@9.0.0`\n");
    });

    it("treats the near-miss scope @narrativetracex/ as somebody else's package", () => {
      guide("`npm add @narrativetracex/core@0.1.1`\n");

      sync(root, REPO_VERSION);

      expect(read("documentation/guide.md")).toBe("`npm add @narrativetracex/core@0.1.1`\n");
    });

    it("preserves a file that has no trailing newline", () => {
      guide("`npm add @narrativetrace/core@0.1.1`");

      sync(root, REPO_VERSION);

      expect(read("documentation/guide.md")).toBe(
        `\`npm add @narrativetrace/core@${REPO_VERSION}\``,
      );
    });

    it("reports every file it rewrote and nothing else", () => {
      guide("`npm add @narrativetrace/core@0.1.1`\n");
      writeFileSync(join(root, "documentation", "untouched.md"), "nothing to see\n", "utf-8");

      expect(sync(root, REPO_VERSION)).toEqual([
        `documentation/guide.md: install coordinate -> ${REPO_VERSION}`,
      ]);
    });

    it("restamps the blob hash of a mirror whose English source it rewrote", () => {
      guide("`npm add @narrativetrace/core@0.1.1`\n");
      mkdirSync(join(root, "documentation", "es"));
      writeFileSync(
        join(root, "documentation", "es", "guia.md"),
        "<!-- source: documentation/guide.md blob 000000000000 | translated: 2026-01-01 | reviewed: - -->\nHola\n",
        "utf-8",
      );

      const changed = sync(root, REPO_VERSION);

      const expected = gitBlobHash12(read("documentation/guide.md"));
      expect(read("documentation/es/guia.md").split("\n")[0]).toContain(`blob ${expected}`);
      expect(changed).toContain("documentation/es/guia.md: blob hash restamped");
    });

    it("leaves the mirror's translated and reviewed dates untouched when it restamps", () => {
      guide("`npm add @narrativetrace/core@0.1.1`\n");
      mkdirSync(join(root, "documentation", "es"));
      writeFileSync(
        join(root, "documentation", "es", "guia.md"),
        "<!-- source: documentation/guide.md blob 000000000000 | translated: 2026-01-01 | reviewed: 2026-02-02 -->\nHola\n",
        "utf-8",
      );

      sync(root, REPO_VERSION);

      expect(read("documentation/es/guia.md")).toContain(
        "| translated: 2026-01-01 | reviewed: 2026-02-02 -->",
      );
    });

    it("never restamps a mirror whose source it did not rewrite", () => {
      writeFileSync(join(root, "documentation", "guide.md"), "no coordinates here\n", "utf-8");
      mkdirSync(join(root, "documentation", "es"));
      const mirror =
        "<!-- source: documentation/guide.md blob 000000000000 | translated: 2026-01-01 | reviewed: - -->\nHola\n";
      writeFileSync(join(root, "documentation", "es", "guia.md"), mirror, "utf-8");

      expect(sync(root, REPO_VERSION)).toEqual([]);
      expect(read("documentation/es/guia.md")).toBe(mirror);
    });

    it("is idempotent — a second run changes nothing", () => {
      guide("`npm add @narrativetrace/core@0.1.1`\n");

      sync(root, REPO_VERSION);

      expect(sync(root, REPO_VERSION)).toEqual([]);
    });

    it("never reaches a private page .publishignore strips", () => {
      writeFileSync(
        join(root, "documentation", "release-plan.md"),
        "`npm add @narrativetrace/core@0.1.1`\n",
        "utf-8",
      );

      sync(root, REPO_VERSION);

      expect(read("documentation/release-plan.md")).toBe("`npm add @narrativetrace/core@0.1.1`\n");
    });

    it("leaves a coordinate already at the repository's version byte-identical", () => {
      guide(`\`npm add @narrativetrace/core@${REPO_VERSION}\`\n`);

      expect(sync(root, REPO_VERSION)).toEqual([]);
    });
  });

  describe("check — the gate", () => {
    function problems(): string[] {
      return check(root, REPO_VERSION);
    }

    it("passes a page with no version talk at all", () => {
      guide("Wrap the object and read the trace.\n");

      expect(problems()).toEqual([]);
    });

    it("passes a coordinate pinned to the repository's own version", () => {
      guide(`\`npm add @narrativetrace/core@${REPO_VERSION}\`\n`);

      expect(problems()).toEqual([]);
    });

    it("fails a coordinate pinned to any other version, naming file and line", () => {
      guide("intro\n`npm add @narrativetrace/core@0.1.1`\n");

      expect(problems()).toEqual([
        `documentation/guide.md:2: NarrativeTrace coordinate pinned to 0.1.1 but this repository ` +
          `is at ${REPO_VERSION} — run snippet-sync, never hand-type a coordinate`,
      ]);
    });

    it("fails a package.json dependency coordinate pinned to another version", () => {
      guide('"@narrativetrace/proxy": "0.1.1"\n');

      expect(problems()).toHaveLength(1);
      expect(problems()[0]).toContain("pinned to 0.1.1");
    });

    it("fails a since-marker", () => {
      guide("The default changed. *(since 0.1.3)*\n");

      expect(problems()).toEqual([
        "documentation/guide.md:1: a *(since …)* marker is version talk — state the behaviour in the present tense instead",
      ]);
    });

    it("fails a since-marker hard-wrapped after the word since", () => {
      guide("The default changed. *(since\n0.1.3, unreleased)*\n");

      expect(problems()).toHaveLength(1);
      expect(problems()[0]).toContain("a *(since …)* marker is version talk");
    });

    it("fails a since-marker hard-wrapped after the version's comma", () => {
      guide("The default changed. *(since 0.1.3,\nunreleased)*\n");

      expect(problems()).toHaveLength(1);
      expect(problems()[0]).toContain("documentation/guide.md:1");
    });

    it("fails a since-marker inside a fenced block — the snippets live there too", () => {
      guide("```text\n*(since 0.1.3)*\n```\n");

      expect(problems()).toHaveLength(1);
    });

    it("fails a since-marker in a heading — a heading anchor is not a version's home", () => {
      guide("## Output directory *(since 0.1.3)*\n");

      expect(problems()).toHaveLength(1);
      expect(problems()[0]).toContain("a *(since …)* marker is version talk");
    });

    it("fails a docs-and-published banner line", () => {
      guide("# NarrativeTrace\n*(Docs and published both at 0.1.3.)*\n");

      expect(problems()).toEqual([
        "documentation/guide.md:2: the docs-vs-published banner was removed — a document describes the code it ships with",
      ]);
    });

    it("fails the differing-versions banner shape", () => {
      guide("*(These docs describe 0.1.4; published is 0.1.3.)*\n");

      expect(problems().some((problem) => problem.includes("banner was removed"))).toBe(true);
    });

    it("fails a registry-checked comment", () => {
      guide("intro <!-- registry checked 2026-09-18T10:00:29.098Z -->\n");

      expect(problems()).toEqual([
        "documentation/guide.md:1: the published-version registry check was removed — delete the comment",
      ]);
    });

    it("passes a third-party coordinate — somebody else's release is not version talk", () => {
      guide("`npm add pino@9.0.0`\n");

      expect(problems()).toEqual([]);
    });

    it("passes a third-party package.json dependency line", () => {
      guide('    "@opentelemetry/api": "^1.9.0",\n');

      expect(problems()).toEqual([]);
    });

    it("treats the near-miss scope @narrativetracex/ as a third-party coordinate", () => {
      guide("`npm add @narrativetracex/core@0.1.1`\n");

      expect(problems()).toEqual([]);
    });

    // The narrowed rule, both halves on one page: somebody else's version in prose — a
    // compatibility-table row, an advisory's before/after pair — is a fact about their release and
    // passes, while OUR coordinate at the wrong version is still the one thing reported.
    it("passes third-party versions in prose and still fails our own coordinate", () => {
      guide(
        "| Vitest | 3.2.7 | the version this repository develops against |\n" +
          "The pino advisory moved 9.5.0 -> 9.6.0.\n" +
          "`npm add @narrativetrace/core@0.1.9`\n",
      );

      expect(problems()).toHaveLength(1);
      expect(problems()[0]).toContain(
        "documentation/guide.md:3: NarrativeTrace coordinate pinned to 0.1.9",
      );
    });

    it("reports problems sorted, across several files", () => {
      guide("*(since 0.1.3)*\n");
      writeFileSync(join(root, "documentation", "alpha.md"), "*(since 0.1.3)*\n", "utf-8");

      expect(problems().map((problem) => problem.split(":")[0])).toEqual([
        "documentation/alpha.md",
        "documentation/guide.md",
      ]);
    });

    it("is green on a repository with no public documents at all", () => {
      rmSync(join(root, "documentation"), { recursive: true, force: true });

      expect(problems()).toEqual([]);
    });
  });

  describe("sync then check", () => {
    it("leaves the page clean for any version — and syncing twice is a no-op", () => {
      fc.assert(
        fc.property(
          fc.tuple(
            fc.integer({ min: 0, max: 99 }),
            fc.integer({ min: 0, max: 99 }),
            fc.integer({ min: 0, max: 99 }),
          ),
          ([major, minor, patch]) => {
            const version = `${major}.${minor}.${patch}`;
            guide('`npm add @narrativetrace/core@0.0.1`\n"@narrativetrace/proxy": "^0.0.1"\n');

            sync(root, version);
            const once = read("documentation/guide.md");
            sync(root, version);

            expect(read("documentation/guide.md")).toBe(once);
            expect(check(root, version)).toEqual([]);
          },
        ),
        { numRuns: 25 },
      );
    });
  });
});

describe("this repository's own public documents", () => {
  it("talk no versions — the rule the gate enforces, asserted as a test too", () => {
    const version = (
      JSON.parse(readFileSync("packages/core/package.json", "utf-8")) as { version: string }
    ).version;

    expect(check(process.cwd(), version)).toEqual([]);
  });
});
