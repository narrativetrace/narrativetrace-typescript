# Agent skills

*(since 0.1.3)*

NarrativeTrace ships **skills**: agent-loadable procedures that run tested commands and gate
completion on a `verify` step, rather than docs an agent might or might not read. A skill is thin
by design — the checking, diagnosis, or generation logic lives in tested library code; the skill's
own job is knowing when to act, invoking that tested code, and interpreting the result in context.

## Two skills: setup and diagnosis

- **`add-narrative-tracing`** — installs NarrativeTrace into a project and gets it to a first
  trace: install with the real toolchain, wrap a class, render and run the first trace, then wire
  a real logger (pino/winston/OpenTelemetry). Ends by running `npx @narrativetrace/cli
  doctor` and handing off — the seam between the two skills.
- **`narrativetrace-doctor`** — diagnosis only, and **read-only**: it never edits, generates, or
  deletes a file. Runs the tested CLI, reads its report, and walks through the parts a plain CLI
  output can't cover on its own: proving redaction in a test, reading a rendered trace before
  asserting against it, and the approval-trace flow (flagged unstudied — its own eval cell is
  still pending).

They compose: a brand-new project starts with `add-narrative-tracing`; a project that already has
NarrativeTrace installed, where something isn't working, starts with `narrativetrace-doctor`.
Either path ends at the doctor — it owns diagnosis from there. A later skill will own generation
(writing the redaction-proof test the doctor can only ask you to add today).

## Installing them

- **Claude Code**: rendered `SKILL.md` files live at
  [`.claude/skills/add-narrative-tracing/`](../.claude/skills/add-narrative-tracing/SKILL.md) and
  [`.claude/skills/narrativetrace-doctor/`](../.claude/skills/narrativetrace-doctor/SKILL.md) in
  this repository, each directory named after its skill's canonical name — Claude's plugin prefix
  is the only place a shortened segment is legitimate, and nothing in this repository is a plugin.
  Copy either directory into your own project's `.claude/skills/<name>/` and Claude picks it up on
  its own, invokable by name (`add-narrative-tracing` / `narrativetrace-doctor`) directly.
- **Any agent, any platform**: every agent that reads `AGENTS.md` sees the always-on pointer this
  repository's own `AGENTS.md` carries between its `<!-- narrativetrace:skills:start -->` markers
  — both skills' names and descriptions, so an agent that never thought to look still knows they
  exist.
- **Codex**: rendered `SKILL.md` files also live at
  [`.agents/skills/add-narrative-tracing/`](../.agents/skills/add-narrative-tracing/SKILL.md) and
  [`.agents/skills/narrativetrace-doctor/`](../.agents/skills/narrativetrace-doctor/SKILL.md) — the
  layout the Codex CLI discovers on its own, walking from the working directory up to the repo
  root (and also `~/.agents/skills` for user-global skills). Its frontmatter is a strict subset of
  Claude's plugin frontmatter (`name` and `description` only — no `when_to_use`, no
  `allowed-tools`), so the identical page body ships under both layouts. Source:
  developers.openai.com/codex/skills and developers.openai.com/codex/concepts/customization
  (fetched 2026-09-13).
- **Gemini, and an automatic installer** (`npx narrativetrace init` writing these paths for you)
  are on the roadmap but not built yet — today, copying the rendered files is the path.

## How they're built

Neither skill is ever hand-edited. `packages/skills/src/catalogue/add-narrative-tracing.ts` and
`packages/skills/src/catalogue/narrativetrace-doctor.ts` are the two sources of truth; `pnpm run
skills-render` regenerates both skills' `.claude/skills/` and `.agents/skills/` pages and this
repository's own `AGENTS.md` section from them, and `pnpm run skills-check` (wired into `pnpm run
check`) fails the build the moment any rendered page drifts from the typed source. Every code
block a rendered page shows is embedded from real, tested source through the same
`<!-- snippet: -->` marker convention this repository's other docs use — never a hand-typed
example. A Tier A lint keeps private planning-note citations out of both pages: rationale sentences
ship, the citation naming the note does not.

## See also

- [`@narrativetrace/cli`](../packages/cli/README.md) — the `doctor` command `narrativetrace-doctor` runs
- [Sixty Seconds](sixty-seconds.md) — the install-and-first-trace walkthrough `add-narrative-tracing`'s steps are drawn from
- [What to Commit](what-to-commit.md) — the approval-trace state the doctor's fourth step checks
