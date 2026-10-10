// SPDX-License-Identifier: BUSL-1.1
// Licensed under the Business Source License 1.1 (see LICENSE); Change Date: four years from publication; Change License: Apache-2.0
// Copyright (c) 2026 Empower Agile
/**
 * Tier B platform presets (skill-harness-design.md §5.1; the sporadic-lanes note,
 * skill-evals-multi-platform-2026-09-13.md, owner-ruled 2026-09-13): fills `run.ts`'s
 * `--agent-command` seam for each of the three supported CLIs so a trial can be started with just
 * `--platform` — never invented for a platform the seam doesn't name, and always overridable by
 * passing `--agent-command` explicitly (the preset is a default, not a lock-in).
 */

export const PLATFORMS = ["claude", "codex", "gemini"] as const;

export type Platform = (typeof PLATFORMS)[number];

export function isPlatform(value: string): value is Platform {
  return (PLATFORMS as readonly string[]).includes(value);
}

/**
 * Codex and Gemini sit on cheaper plans and run under the sporadic policy (never scheduled,
 * promotion points only, quota-guarded, Tier A/A2-green precondition). Claude runs on the
 * harness's own regular cadence and is exempt from all three.
 */
export const SPORADIC_PLATFORMS: readonly Platform[] = ["codex", "gemini"];

export function isSporadicPlatform(platform: Platform): boolean {
  return (SPORADIC_PLATFORMS as readonly string[]).includes(platform);
}

/**
 * `narrativetrace-doctor` is scoped read-only by design (agent-skills.md: "diagnosis only, and
 * read-only: it never edits, generates, or deletes a file"); every other cataloged skill installs
 * or edits files. Used to pick the least-privileged sandbox/approval mode a trial needs.
 */
export function isReadOnlySkill(skill: string): boolean {
  return skill === "narrativetrace-doctor";
}

/**
 * Codex `-s/--sandbox`: `read-only` for a read-only skill, `workspace-write` otherwise.
 * `--skip-git-repo-check` is always present: the runner scaffolds every trial's fixture into a
 * fresh scratch temp directory (`runner.ts`'s `scaffoldFixture`, outside every repo tree by
 * design) — never a project registered trusted in `~/.codex/config.toml` and never a git repo, so
 * Codex's own trust gate ("Not inside a trusted directory and --skip-git-repo-check was not
 * specified") refuses to start there without this flag (harness defect #4, found running the
 * first real codex trial, 2026-09-14). The `--sandbox` mode above is the actual safety boundary;
 * this flag only bypasses the trust *prompt*, not sandboxing.
 */
function codexCommand(model: string, skill: string): string {
  const sandbox = isReadOnlySkill(skill) ? "read-only" : "workspace-write";
  return `codex exec --sandbox ${sandbox} --skip-git-repo-check --model ${model} "{prompt}"`;
}

/** Gemini `--approval-mode`: `plan` (its read-only mode) for a read-only skill, `auto_edit` otherwise. */
function geminiCommand(model: string, skill: string): string {
  const approvalMode = isReadOnlySkill(skill) ? "plan" : "auto_edit";
  return `gemini -p "{prompt}" --model ${model} --approval-mode ${approvalMode}`;
}

/**
 * What the Claude CLI is allowed to do in a trial, as a comma-separated `--allowed-tools` list —
 * one quoted argv element, never five unquoted ones (`tokenizeCommandTemplate` keeps a `"..."`
 * span together). Derived from the published init prompt, not from convenience: step 1 is "read
 * https://narrativetrace.ai/typescript/llms.txt first" (`WebFetch`), steps 2-4 create, edit and
 * test a project (`Read`, `Edit`, `Write`), step 5 runs it (`Bash`). A preset that grants less
 * than the prompt asks for measures the sandbox rather than the skill — a trial where the agent
 * is refused mid-step-1 and stops is a harness result wearing a product result's clothes (family
 * ruling 2026-09-25, applied first in the Java and Python runtimes).
 *
 * `Skill` joined the list for the registry cases: the prompt's step 4 opens "if the
 * `add-narrative-tracing` skill is now available, follow it", and a trial whose agent cannot invoke
 * a skill measures nothing a registry delivered — the same class of defect as the missing `WebFetch`
 * the ruling above closed.
 */
const CLAUDE_TOOLS = "Bash,Read,Edit,Write,WebFetch,Skill";

/**
 * The machine-readable stream, because a grader has to read the agent's TOOL CALLS and not only its
 * closing text: a URL a command printed and a URL typed into a reply are the same event to a gate
 * that must not see either before the user's approval turn.
 *
 * @llmNote `--verbose` is not decoration: without it this CLI refuses `stream-json` under `-p` and
 * exits 1 before any turn starts (measured here 2026-10-08: "requires --verbose" on stderr, nothing
 * on stdout — so a transcript with nothing in it, which a grader would read as an idle agent).
 */
const CLAUDE_TRANSCRIPT_FORMAT = "--output-format stream-json --verbose";

/**
 * No MCP server at all — `--strict-mcp-config` with no `--mcp-config` beside it.
 *
 * @llmNote The throwaway configuration (`isolated-agent-config.ts`) cannot reach these: the
 * subscription login it seeds carries the ACCOUNT's own connectors, and the CLI injects their state
 * into the agent's context mid-turn. Measured here 2026-10-08: without this flag a trial's agent
 * quotes "claude.ai Cloudflare Developer Platform failed to connect (HTTP 410)" and an OAuth
 * notice; with it, none. The first feedback trial spent the end of its reply explaining that
 * connector to the user — a configuration wider than the product measures the operator's account.
 */
const CLAUDE_NO_MCP = "--strict-mcp-config";

/** What a multi-turn template carries where the trial's own session id goes. */
export const SESSION_PLACEHOLDER = "{session}";

/**
 * The default `--agent-command` template for `platform`, `{prompt}`-substituted by `run.ts`. Each
 * CLI uses its own subscription login — the harness never passes an API key, so no preset ever
 * threads one through.
 */
export function presetAgentCommand(platform: Platform, model: string, skill: string): string {
  if (platform === "claude") {
    return `claude -p "{prompt}" --model ${model} --allowed-tools "${CLAUDE_TOOLS}" ${CLAUDE_NO_MCP} ${CLAUDE_TRANSCRIPT_FORMAT}`;
  }
  if (platform === "codex") return codexCommand(model, skill);
  return geminiCommand(model, skill);
}

/**
 * The single-turn preset plus one session flag and nothing else — so a multi-turn trial is the same
 * sandbox, tools and transcript format as a single-turn one, differing only in being ONE
 * conversation.
 *
 * @llmNote `undefined` for every platform but Claude, in BOTH halves: its `--session-id` and
 * `--resume` were verified by hand in the container the trials run in, and no other CLI's were. A
 * platform that could open a conversation but not resume it would run its "second turn" as a fresh
 * session with no memory of the draft, where "nothing was filed" is true for a reason that has
 * nothing to do with the gate under test.
 */
function multiTurn(
  platform: Platform,
  model: string,
  skill: string,
  sessionFlag: string,
): string | undefined {
  if (platform !== "claude") return undefined;
  return `${presetAgentCommand(platform, model, skill)} ${sessionFlag} ${SESSION_PLACEHOLDER}`;
}

/** How a trial opens a conversation the runner will drive further; `undefined` where unverified. */
export function presetFirstTurnCommand(
  platform: Platform,
  model: string,
  skill: string,
): string | undefined {
  return multiTurn(platform, model, skill, "--session-id");
}

/** How a trial continues that SAME conversation on every later turn — resumed, never forked. */
export function presetResumedTurnCommand(
  platform: Platform,
  model: string,
  skill: string,
): string | undefined {
  return multiTurn(platform, model, skill, "--resume");
}
