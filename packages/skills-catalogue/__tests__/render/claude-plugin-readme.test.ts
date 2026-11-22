// SPDX-License-Identifier: BUSL-1.1
// Licensed under the Business Source License 1.1 (see LICENSE); Change Date: four years from publication; Change License: Apache-2.0
// Copyright (c) 2026 Empower Agile
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { BODY_PATH, DRAFT_PATH } from "../../src/catalogue/feedback-commands.js";
import { MARKETPLACE, SKILLS } from "../../src/catalogue-index.js";
import { renderClaudePluginReadme } from "../../src/render/claude-plugin-readme.js";
import { commandStrings, firstToken } from "../../src/skill.js";
import { REPO_ROOT } from "../repo-root.js";

// The plugin README is what Anthropic's directory shows as the listing description, and the
// security scan reads it for behaviour the plugin does not disclose. These tests derive each
// disclosed fact from the catalogue's own data independently of the renderer, so a command added to
// a skill and not disclosed fails here. Mirrors the Java ClaudePluginReadmeRendererTest.

const LISTING = MARKETPLACE;
const README = renderClaudePluginReadme(LISTING, SKILLS);

describe("renderClaudePluginReadme", () => {
  it("lists every skill by name with its description's first sentence", () => {
    for (const skill of SKILLS) {
      const firstSentence = skill.description.split(/(?<=\.)\s/, 1)[0] as string;
      const line = README.split("\n").find((l) => l.includes(`\`${skill.canonicalName}\``));
      expect(line, skill.canonicalName).toBeDefined();
      expect(line).toMatch(/^- /);
      expect(line).toContain((firstSentence.split(":", 1)[0] as string).trim().replace(/\.$/, ""));
    }
  });

  // The directory's rule: at least 40 words, words inside code blocks not counted.
  it("has at least forty words outside code blocks", () => {
    const prose = README.replace(/```[\s\S]*?```/g, " ");
    expect(prose.trim().split(/\s+/).length).toBeGreaterThanOrEqual(40);
  });

  it("discloses every command the skills run, verbatim", () => {
    const commands = new Set(SKILLS.flatMap((skill) => commandStrings(skill)));
    for (const tool of ["pnpm", "npx", "node", "git"]) {
      expect(
        [...commands].some((c) => firstToken(c) === tool),
        tool,
      ).toBe(true);
    }
    for (const command of commands) {
      expect(README, command).toContain(command);
    }
  });

  it("separates the one script that writes from the scripts that only read", () => {
    const writers = SKILLS.flatMap((s) => commandStrings(s)).filter((c) =>
      c.includes("writeFileSync"),
    );
    expect(writers.length).toBeGreaterThan(0);
    const marker = README.indexOf("One `node -e` script writes");
    expect(marker).toBeGreaterThan(-1);
    for (const writer of new Set(writers)) {
      expect(README.indexOf(writer), writer).toBeGreaterThan(marker);
    }
    const readers = README.slice(0, marker);
    for (const writer of writers) expect(readers).not.toContain(writer);
  });

  it("says the package manager resolves the newest release from the npm registry, no lookup", () => {
    expect(README)
      .toContain("pin no NarrativeTrace version")
      .toContain("resolves the newest release from the npm")
      .not.toContain("maven");
    expect(README).toContain("registry");
  });

  it("names every package the install step adds", () => {
    expect(README).toContain("`@narrativetrace/core-node`");
    expect(README).toContain("`@narrativetrace/proxy`");
    expect(README).toContain("`@narrativetrace/pino`");
  });

  it("states precisely what the feedback skill does and that nothing is sent", () => {
    expect(README)
      .toContain("narrativetrace-feedback")
      .toContain("pre-filled")
      .toContain(`${LISTING.repository}/issues/new`)
      .toContain("nothing is sent")
      .toContain("never opens")
      .toContain("never runs the command it prints")
      .toContain("never runs `gh`")
      .toContain(DRAFT_PATH)
      .toContain(BODY_PATH);
  });

  it("states the plugin pre-approves no command and carries no hooks or servers", () => {
    expect(README).toContain("pre-approves no command");
    expect(README).toContain("no hooks");
  });

  it("carries the license, homepage and repository from the listing", () => {
    expect(README).toContain(LISTING.license);
    expect(README).toContain(LISTING.homepage);
    expect(README).toContain(LISTING.repository);
  });

  it("names the install commands from the listing", () => {
    expect(README)
      .toContain("/plugin marketplace add narrativetrace/narrativetrace-typescript")
      .toContain(`/plugin install ${LISTING.name}@${LISTING.name}`);
  });

  it("carries no version number, so a release that leaves the skills alone leaves it identical", () => {
    expect(README).not.toMatch(/\d+\.\d+\.\d+/);
  });

  it("renders byte-identically every time", () => {
    expect(renderClaudePluginReadme(LISTING, SKILLS)).toBe(README);
  });

  it("skips the writer paragraph when no command writes a file", () => {
    const readOnly = SKILLS.map((skill) => ({
      ...skill,
      steps: skill.steps.filter(
        (step) =>
          step.body.kind !== "commands" ||
          !step.body.commands.some((command) => command.includes("writeFileSync")),
      ),
    }));
    expect(renderClaudePluginReadme(LISTING, readOnly)).not.toContain(
      "One `node -e` script writes",
    );
  });

  it("states the plain no-warranty line in the licence section", () => {
    const license = README.slice(README.indexOf("## License and links"));
    expect(license).toContain(
      "NarrativeTrace is provided as is: no warranty, and no guarantee that it fits your purpose. Use it at your own risk.",
    );
  });

  // The quoted disclaimer is the repository's own LICENSE-APACHE section 7, character for character.
  it("quotes the Apache disclaimer of warranty exactly as LICENSE-APACHE has it", () => {
    const licenseFile = readFileSync(join(REPO_ROOT, "LICENSE-APACHE"), "utf-8");
    const start = licenseFile.indexOf("7. Disclaimer of Warranty.");
    const section7 = licenseFile.slice(start, licenseFile.indexOf("\n\n", start));
    const quoted = section7
      .split("\n")
      .map((line) => `> ${line.trim()}`)
      .join("\n");
    expect(README).toContain(quoted);
  });

  it("links the Apache licence file and names the limitation-of-liability section", () => {
    expect(README)
      .toContain(`${LISTING.repository}/blob/main/LICENSE-APACHE`)
      .toContain("Section 8")
      .toContain("Limitation of Liability");
  });

  it("says the runtime the skills install is under the Business Source License and links LICENSE", () => {
    expect(README).toContain(
      `The NarrativeTrace runtime that these skills install is licensed under the Business Source License 1.1; see [LICENSE](${LISTING.repository}/blob/main/LICENSE).`,
    );
  });

  it("limits the section 8 pointer to the Apache-licensed parts", () => {
    expect(README).toContain("limits liability further (Apache-licensed parts only).");
  });
});
