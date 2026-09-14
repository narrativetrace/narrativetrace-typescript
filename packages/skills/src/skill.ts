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
 * same `<!-- snippet: path -->` marker convention `snippet-check` already enforces for docs
 * (agent-skills-2026-09-12.md §3: "never a second hand-copied literal"). `path` is repo-root-relative.
 */
export interface SnippetStep {
  readonly kind: "snippet";
  readonly path: string;
  readonly language: string;
  readonly mask?: string;
}

export type StepBody = CommandStep | SnippetStep;

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
  /** e.g. `"unstudied — eval cell pending"` (agent-skills-2026-09-12.md §7 ruling 4). */
  readonly flag?: string;
}

/** A `never`/`always` rule WITH its reason (skill-design.md §2: "naked prohibitions don't [survive]"). */
export interface ReasonedRule {
  readonly rule: string;
  readonly reason: string;
}

export interface Skill {
  /**
   * Globally self-identifying, flat-namespace-safe (skill-design.md §3.1/§6 Q2) —
   * `narrativetrace-doctor`, never a bare `doctor`. This is the ONLY name a rendered page ever
   * carries: every platform's frontmatter `name:` and every platform's directory equal this
   * string. A shortened segment (`doctor`) is legitimate only inside a plugin whose own prefix
   * already carries the brand (owner ruling, skills design, 2026-09-04; reaffirmed 2026-09-13) —
   * nothing this repository renders is that, so there is no shortened-name field here at all.
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
