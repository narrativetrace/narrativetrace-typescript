// SPDX-License-Identifier: BUSL-1.1
// Licensed under the Business Source License 1.1 (see LICENSE); Change Date: four years from publication; Change License: Apache-2.0
// Copyright (c) 2026 Empower Agile
/**
 * The typed catalogue schema (skill-design.md §4.1, §2; skill-harness-design.md §7, principle 5).
 * A `Skill` is the source of truth a `render/*` module turns into per-platform artifacts
 * (`SKILL.md`, the AGENTS.md snippet) — never hand-write those; regenerate them (`render-skills`).
 */

/** Drives which case kinds the eval harness expects (skill-harness-design.md §7). */
export type SkillClass = "mechanical" | "guided" | "judgmental";

/**
 * The closed per-port command vocabulary (skill-harness-design.md principle 7): a `commands` step's
 * first token must be one of these, or Tier A fails naming the offending step. TypeScript's
 * vocabulary — `pnpm`/`npx`/`node`/`git` — is the fixture's OWN toolchain (a pnpm workspace member),
 * not necessarily a real user's package manager; see `catalogue/narrativetrace-doctor.ts` for the
 * amendment note on where that distinction matters.
 */
export const COMMAND_VOCABULARY = ["pnpm", "npx", "node", "git"] as const;

/** A step that runs one or more shell commands, replayed verbatim against the fixture (Tier A2). */
export interface CommandStep {
  readonly kind: "commands";
  readonly commands: readonly string[];
}

/**
 * A step that shows real, current source rather than a hand-typed example — rendered through the
 * same `<!-- snippet: path -->` marker convention `snippet-check` already enforces for docs: never
 * a second hand-copied literal. `path` is repo-root-relative.
 */
export interface SnippetStep {
  readonly kind: "snippet";
  readonly path: string;
  readonly language: string;
  readonly mask?: string;
}

/**
 * A step that shows a few lines the reader adds to their OWN project (a config switch, an option)
 * — code that exists nowhere in this repository, so there is no file for a {@link SnippetStep} to
 * point at. Nothing to replay: a reader's project is not the fixture.
 */
export interface CodeStep {
  readonly kind: "code";
  readonly language: string;
  readonly code: string;
}

export type StepBody = CommandStep | SnippetStep | CodeStep;

/** Symptom → cause → fix, verbose enough to act on (skill-design.md §2: every fallible step carries this). */
export interface FailureNote {
  readonly symptom: string;
  readonly cause: string;
  readonly fix: string;
}

export interface SkillStep {
  readonly title: string;
  readonly body: StepBody;
  /** A `commands`-vocabulary string proving the step succeeded. Omitted only for a judgmental step. */
  readonly verify?: string;
  readonly failure?: readonly FailureNote[];
  /** e.g. `"unstudied — eval cell pending"`. */
  readonly flag?: string;
  /**
   * When present, rendered as a `**when:**` line under the heading: the step applies only then, and
   * the line says what to do instead. Prose a reader or agent branches on — never a framework list.
   */
  readonly condition?: string;
}

/** A `never`/`always` rule WITH its reason (skill-design.md §2: "naked prohibitions don't [survive]"). */
export interface ReasonedRule {
  readonly rule: string;
  readonly reason: string;
}

/**
 * A named block of reference text a skill renders after its steps — a table or a short list the
 * steps point at, which is neither a step nor an always/never rule. Port of Java `SkillSection`.
 *
 * INTENT: two skills that read traces share one "how to read a trace" text; a section is how that
 * text is written once in the catalogue and rendered into both pages identically, instead of being
 * copied into a step's prose where the copies drift. Build one with {@link skillSection}.
 */
export interface SkillSection {
  /** Rendered as a level-two heading: one line of text, not itself a heading marker. */
  readonly heading: string;
  /** The section's body, rendered as written. */
  readonly markdown: string;
}

/**
 * A {@link SkillSection}, checked.
 *
 * @throws TypeError when the heading is blank, spans more than one line (LF or CR), or starts
 * with `#`; or when the body is blank.
 */
export function skillSection(heading: string, markdown: string): SkillSection {
  if (heading.trim() === "") throw new TypeError("a SkillSection's heading must not be blank");
  if (/[\r\n]/.test(heading) || heading.startsWith("#")) {
    throw new TypeError(`a SkillSection's heading is one line of text, not markdown: ${heading}`);
  }
  if (markdown.trim() === "") throw new TypeError("a SkillSection's markdown must not be blank");
  return { heading, markdown };
}

export interface Skill {
  /**
   * Globally self-identifying, flat-namespace-safe (skill-design.md §3.1/§6 Q2) —
   * `narrativetrace-doctor`, never a bare `doctor`. This is the ONLY name a rendered page ever
   * carries: every platform's frontmatter `name:` and every platform's directory equal this
   * string. A shortened segment (`doctor`) is legitimate only inside a plugin whose own prefix
   * already carries the brand — nothing this repository renders is that, so there is no
   * shortened-name field here at all.
   */
  readonly canonicalName: string;
  readonly skillClass: SkillClass;
  /** ≤1024 chars, third person, WHAT + WHEN with mined trigger phrasings (skill-design.md §2). */
  readonly description: string;
  readonly whenToUse?: string;
  /** Repo-root-relative fixture the skill is exercised against (skill-harness-design.md §6). */
  readonly fixture: string;
  readonly steps: readonly SkillStep[];
  readonly always: readonly ReasonedRule[];
  readonly never: readonly ReasonedRule[];
  /** Reference text rendered after the steps, before the rules — see {@link SkillSection}. */
  readonly references?: readonly SkillSection[];
  /** Emitted into `allowed-tools` (skill-design.md §2) — the command vocabulary this skill uses. */
  readonly allowedTools: readonly string[];
}

const DESCRIPTION_BUDGET = 1024;

/** Every string a lint should check a skill's `commands` steps against the closed vocabulary. */
export function commandStrings(skill: Skill): readonly string[] {
  return skill.steps.flatMap((step) => (step.body.kind === "commands" ? step.body.commands : []));
}

/** The first whitespace-separated token of a shell command — what principle 7 checks. */
export function firstToken(command: string): string {
  // Stryker disable next-line Regex: `+` vs no `+` is equivalent for this one read of index [0] —
  // String.split's first element is always the text before the FIRST delimiter match, which
  // starts at the same position whether the match consumes one whitespace character or a whole
  // run of them. Only the later array elements (never read here) would differ.
  return command.trim().split(/\s+/)[0] ?? "";
}

/** Every `commands` string violating the closed command vocabulary, in `skill: command` form. */
export function vocabularyViolations(skill: Skill): readonly string[] {
  return commandStrings(skill)
    .filter((cmd) => !(COMMAND_VOCABULARY as readonly string[]).includes(firstToken(cmd)))
    .map((cmd) => `${skill.canonicalName}: ${cmd}`);
}

/**
 * The Claude-flavour `allowed-tools` spelling of one vocabulary command: the `Bash(<command> *)`
 * tool pattern (e.g. `git` -> `Bash(git *)`).
 *
 * Verified against Claude Code's documented syntax: a permission rule is spelled `Tool` or
 * `Tool(specifier)`, and `allowed-tools` lists TOOLS, not commands — so a bare `git` there names a
 * tool that does not exist and pre-approves nothing at all, while the tool the steps actually use
 * (`Bash`) stays unlisted. The trailing `" *"` is load-bearing twice over: a rule's wildcard must
 * sit after the subcommand (the words before it are what limit the rule), and a trailing `" *"`
 * also matches the bare command, which is what lets `Bash(./gradlew *)` cover a plain `./gradlew`.
 *
 * The ONLY place a platform spelling of the vocabulary is written: a hand-written `Bash(git *)` in
 * the catalogue would render as `Bash(Bash(git *) *)` — a rule matching nothing — caught by
 * {@link allowedToolsViolations}.
 */
export function claudeToolPattern(command: string): string {
  return `Bash(${command} *)`;
}

/**
 * Every declared `allowedTools` entry that is not a bare command of the closed vocabulary: an
 * entry outside {@link COMMAND_VOCABULARY}, or one already written in a platform's own rendered
 * spelling (a `Bash(...)` tool pattern). Pins the split {@link claudeToolPattern} and the Claude
 * renderer depend on: the catalogue declares commands, the renderer spells them, and neither side
 * may quietly become the other.
 */
export function allowedToolsViolations(skill: Skill): readonly string[] {
  const violations: string[] = [];
  for (const tool of skill.allowedTools) {
    if (tool.includes("(")) {
      violations.push(
        `${skill.canonicalName}: allowed tool "${tool}" is a rendered platform spelling — declare the bare command and let the renderer spell it`,
      );
    } else if (!(COMMAND_VOCABULARY as readonly string[]).includes(tool)) {
      violations.push(`${skill.canonicalName}: allowed tool "${tool}" is outside the vocabulary`);
    }
  }
  return violations;
}

/** `description` fits the per-skill budget (catalogue-wide budget is a separate index-level lint). */
export function descriptionFitsBudget(skill: Skill): boolean {
  return skill.description.length <= DESCRIPTION_BUDGET;
}

/**
 * The replayability rule (skill-harness-design.md principle 5): every step must carry a `verify`
 * UNLESS it is explicitly judgmental (no `verify`, and the reason is documented in `flag` or in the
 * step's own body — the schema cannot enforce prose, only that the step is not silently missing
 * one). A `mechanical`-class skill's steps must ALL carry `verify` except ones an owning skill
 * document has flagged.
 */
export function stepsWithoutVerify(skill: Skill): readonly string[] {
  return skill.steps.filter((step) => step.verify === undefined).map((step) => step.title);
}
