// SPDX-License-Identifier: BUSL-1.1
// Licensed under the Business Source License 1.1 (see LICENSE); Change Date: four years from publication; Change License: Apache-2.0
// Copyright (c) 2026 Empower Agile
import { BODY_PATH, DRAFT_PATH } from "../catalogue/feedback-commands.js";
import type { MarketplaceListing } from "../marketplace-listing.js";
import { commandStrings, firstToken, type Skill } from "../skill.js";

/**
 * Renders `.claude/README.md`: the plugin folder's README, which Anthropic's plugin directory shows
 * as the listing description and whose security scan reads for behaviour the plugin does not
 * disclose. It says what the plugin is, what its skills run, fetch and send, and under which
 * licence it ships.
 *
 * Every disclosed fact is derived from the typed catalogue, never typed twice: the skill names and
 * their one-line summaries from each skill's `description`, every command the skills run from
 * `commandStrings` (listed verbatim, grouped by the tool that runs it), the packages the install
 * step adds from those commands, the feedback skill's files from `feedback-commands.ts`, and the
 * licence, homepage and repository from the {@link MarketplaceListing}. A command added to a skill
 * therefore reaches the README with the next render, and `tools/skills-render.ts --check` fails the
 * build until it does.
 *
 * The README names no version number, for the reason the plugin manifest does not: a release that
 * leaves the skills alone leaves this folder byte-identical. The TypeScript skills install without
 * a version, so there is no lookup to disclose: the package manager resolves the newest release
 * from the npm registry.
 *
 * @llmNote The statements about what the feedback skill sends are not derived: they are the
 * contract of that skill (it drafts, shows the draft, asks once, then prints a URL and never opens
 * it), pinned by the skill's own tests and by the verb's own design (it makes no request of its
 * own and runs no `gh`). Change them only together with that skill.
 */
export function renderClaudePluginReadme(
  listing: MarketplaceListing,
  skills: readonly Skill[],
): string {
  return [
    introduction(listing, skills),
    skillList(skills),
    whatTheSkillsRun(skills),
    whatTheSkillsFetch(skills),
    whatTheSkillsSend(listing),
    licenseAndLinks(listing),
  ].join("");
}

function introduction(listing: MarketplaceListing, skills: readonly Skill[]): string {
  return [
    `# ${listing.name}\n\n`,
    `${listing.description} This plugin carries ${skills.length} skills and nothing else: no hooks,`,
    " no MCP servers, no executables. Each skill is a page of instructions that Claude follows in",
    " your TypeScript project, using your own package manager and Claude Code's normal permission",
    " prompts.\n\n",
    "Install it from this repository's marketplace:\n\n",
    "```\n",
    `/plugin marketplace add ${slug(listing)}\n`,
    `/plugin install ${listing.name}@${listing.name}\n`,
    "```\n\n",
  ].join("");
}

function skillList(skills: readonly Skill[]): string {
  const lines = skills.map((skill) => `- \`${skill.canonicalName}\`: ${summary(skill)}\n`);
  return `## Skills\n\n${lines.join("")}\n`;
}

/** Every distinct command the skills run, in the order the catalogue first spells them. */
function distinctCommands(skills: readonly Skill[]): readonly string[] {
  return [...new Set(skills.flatMap((skill) => commandStrings(skill)))];
}

function commandsOf(commands: readonly string[], tool: string): readonly string[] {
  return commands.filter((command) => firstToken(command) === tool);
}

function codeBlock(lines: readonly string[]): string {
  return `\`\`\`\n${lines.join("\n")}\n\`\`\`\n\n`;
}

/** A `node -e` one-liner that calls `writeFileSync` changes a file; every other one only reads. */
function writesAFile(command: string): boolean {
  return command.includes("writeFileSync");
}

function whatTheSkillsRun(skills: readonly Skill[]): string {
  const commands = distinctCommands(skills);
  return [
    "## What the skills run\n\n",
    "The plugin pre-approves no command. The first time a skill runs one of these in your project,",
    " Claude Code asks you. Every command is listed here exactly as the skills spell it.\n\n",
    packageManagerCommands(commands),
    npxCommands(commands),
    "- `git`, to read what changed in your project:\n\n",
    codeBlock(commandsOf(commands, "git")),
    nodeCommands(commandsOf(commands, "node")),
    "Two skills also edit your project's files. The install skill adds the NarrativeTrace",
    " packages to your `package.json` and shows a first trace in a small script or test; the",
    " Clarity skill registers its reporter in your Vitest config and, only when you ask, wires a",
    " gate into your package scripts.\n\n",
  ].join("");
}

function packageManagerCommands(commands: readonly string[]): string {
  return [
    "- `pnpm`, to add the NarrativeTrace packages to your project and to check the install with a",
    " clean, frozen-lockfile install. `pnpm add` edits your `package.json` and lockfile:\n\n",
    codeBlock(commandsOf(commands, "pnpm")),
  ].join("");
}

function npxCommands(commands: readonly string[]): string {
  return [
    "- `npx`, to run the NarrativeTrace command line, your own test runner and the two commands",
    " the NarrativeTrace packages put in your project. `init --dry-run` only previews an install",
    " and writes nothing. `feedback draft` writes the two report files described below. Applying",
    " an install and promoting an approval baseline with `narrativetrace-approve` are separate",
    " steps that wait for your yes:\n\n",
    codeBlock(commandsOf(commands, "npx")),
  ].join("");
}

/** The `node -e` scripts: the readers first, then the one that writes, set apart. */
function nodeCommands(node: readonly string[]): string {
  const writers = node.filter(writesAFile);
  const writerParagraph =
    writers.length > 0
      ? [
          "One `node -e` script writes. It changes your `package.json` and nothing else:\n\n",
          codeBlock(writers),
        ].join("")
      : "";
  return [
    "- `node -e`, short scripts that print a reminder or read files in your project and print",
    " them: the traces and reports under `narrativetrace-output/` and `narratives/`, and your",
    " `package.json`:\n\n",
    codeBlock(node.filter((command) => !writesAFile(command))),
    writerParagraph,
  ].join("");
}

/** The `@narrativetrace/*` packages the skills' own `pnpm add` commands install. */
function installedPackages(skills: readonly Skill[]): readonly string[] {
  const packages = commandsOf(distinctCommands(skills), "pnpm")
    .filter((command) => command.startsWith("pnpm add"))
    .flatMap((command) => command.split(/\s+/))
    .filter((token) => token.startsWith("@narrativetrace/"));
  return [...new Set(packages)].sort();
}

function whatTheSkillsFetch(skills: readonly Skill[]): string {
  const packages = installedPackages(skills)
    .map((name) => `\`${name}\``)
    .join(", ");
  return [
    "## What the skills fetch\n\n",
    "- The skills pin no NarrativeTrace version and look nothing up themselves: they install",
    " without a version, so your package manager resolves the newest release from the npm",
    ` registry, as it resolves any dependency. The packages they add are ${packages}.\n`,
    "- `npx @narrativetrace/cli` downloads the NarrativeTrace command line from the npm registry",
    " the first time it runs, if your project does not already have it.\n",
    "- Your own package manager then resolves what those packages depend on. The skills fetch",
    " nothing else.\n\n",
  ].join("");
}

function whatTheSkillsSend(listing: MarketplaceListing): string {
  return [
    "## What the skills send\n\n",
    "Nothing leaves your machine from this plugin: no skill uploads, posts or transmits anything,",
    " and it has no hooks, MCP servers or network code of its own.\n\n",
    "`narrativetrace-feedback` is the one skill about reporting a defect in NarrativeTrace itself.",
    ` It drafts a report from your project into \`${DRAFT_PATH}\``,
    ` and \`${BODY_PATH}\` (the install coordinates, the doctor's JSON report and at most one`,
    " structural trace, and it refuses to write a report that carries a value from your own run),",
    " shows you the whole draft, and asks once whether to file it. Only after your yes does it",
    ` print a pre-filled issue address (${listing.repository}/issues/new?...) and the name of the`,
    " body file to paste. It never opens that address, never runs the command it prints, and never",
    " runs `gh`: nothing is sent unless you open the address yourself, in your own browser, under",
    " your own account, and the issue you file is public.\n\n",
  ].join("");
}

const NO_WARRANTY =
  "NarrativeTrace is provided as is: no warranty, and no guarantee that it fits your purpose. Use it at your own risk.";

/** Section 7 of `LICENSE-APACHE`, line for line; a test pins it against that file. */
const APACHE_DISCLAIMER: readonly string[] = [
  "7. Disclaimer of Warranty. Unless required by applicable law or",
  "agreed to in writing, Licensor provides the Work (and each",
  'Contributor provides its Contributions) on an "AS IS" BASIS,',
  "WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or",
  "implied, including, without limitation, any warranties or conditions",
  "of TITLE, NON-INFRINGEMENT, MERCHANTABILITY, or FITNESS FOR A",
  "PARTICULAR PURPOSE. You are solely responsible for determining the",
  "appropriateness of using or redistributing the Work and assume any",
  "risks associated with Your exercise of permissions under this License.",
];

function licenseAndLinks(listing: MarketplaceListing): string {
  return [
    "## License and links\n\n",
    `The skills in this plugin are licensed under ${listing.license}.\n\n`,
    `- Homepage: ${listing.homepage}\n`,
    `- Repository: ${listing.repository}\n\n`,
    `${NO_WARRANTY}\n\n`,
    `The Apache-2.0 text, [LICENSE-APACHE](${listing.repository}/blob/main/LICENSE-APACHE), section 7:\n\n`,
    ...APACHE_DISCLAIMER.map((line) => `> ${line}\n`),
    '\nSection 8, "Limitation of Liability", of the same file limits liability further (Apache-licensed parts only).\n\n',
    `The NarrativeTrace runtime that these skills install is licensed under the Business Source License 1.1; see [LICENSE](${listing.repository}/blob/main/LICENSE).\n`,
  ].join("");
}

/** The first sentence of the description; a "Use when" lead-in is cut at its first colon. */
function summary(skill: Skill): string {
  const description = skill.description;
  const end = description.indexOf(". ");
  const sentence = end < 0 ? description : description.slice(0, end + 1);
  return sentence.startsWith("Use when") && sentence.includes(":")
    ? `${sentence.slice(0, sentence.indexOf(":"))}.`
    : sentence;
}

/** `owner/name` of a GitHub repository URL, the form `/plugin marketplace add` takes. */
function slug(listing: MarketplaceListing): string {
  const prefix = "https://github.com/";
  return listing.repository.startsWith(prefix)
    ? listing.repository.slice(prefix.length)
    : listing.repository;
}
