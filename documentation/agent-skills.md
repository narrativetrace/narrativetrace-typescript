# Agent skills

NarrativeTrace ships **skills**: agent-loadable procedures that run tested commands and gate
completion on a `verify` step, rather than docs an agent might or might not read. A skill is thin
by design — the checking, diagnosis, or generation logic lives in tested library code; the skill's
own job is knowing when to act, invoking that tested code, and interpreting the result in context.

## Six skills: setup, diagnosis, clarity, reporting, verifying and debugging

- **`add-narrative-tracing`** — installs NarrativeTrace into a project and gets it to a first
  trace: install with the real toolchain, wire the frameworks the project already uses by running
  the doctor and applying every `config.<framework>-*` fix it prints (the page names no framework:
  the installed doctor's own framework table is the oracle), wrap a class, render and run the first
  trace, then wire a real logger (pino/winston/OpenTelemetry). Ends by running `npx @narrativetrace/cli
  doctor` and handing off — the seam between the two skills.
- **`narrativetrace-doctor`** — diagnosis only, and **read-only**: it never edits, generates, or
  deletes a file. Runs the tested CLI, reads its report, and walks through the parts a plain CLI
  output can't cover on its own: proving redaction in a test, reading a rendered trace before
  asserting against it, and the approval-trace flow (flagged unstudied — its own eval cell is
  still pending).
- **`add-narrativetrace-clarity`** — adds or verifies a naming report in a Vitest project: registers
  `ClaritySuiteReporter` from `@narrativetrace/vitest/reporters`, runs the suite, checks the fresh
  nonempty `clarity-results.json`, reads the scores and issues, and explains them. It renames by the
  report's own suggestions and re-runs until `npx narrativetrace-clarity` is clean, and adds a
  gate to the package scripts only when asked — never lowering a threshold the project already has.
- **`narrativetrace-feedback`** — reports a defect in NarrativeTrace itself: a doctor check that is
  wrong or whose fix does not work, a skill step that cannot be followed, wording in the install
  prompt that led somewhere wrong, or the library misbehaving on a correctly configured project.
  The tested verb behind it, `narrativetrace feedback`, drafts the report from the project (the
  install coordinates, the doctor's own JSON report, and at most one structural trace) and
  **refuses to write a report that carries a value from your traces** — naming the rule that
  refused it, so there is something specific to fix rather than a warning to ignore. The skill
  then shows the whole draft and asks once whether to file it publicly. It sends nothing anywhere
  and files nothing without an answer given in a turn of its own.
- **`narrativetrace-verify`** — reads what a change actually did before the agent says it is
  done. It runs after the tests are green and starts with a cost rule it says out loud: trace a
  change that crosses collaborators, branches, retries, runs async or carries state; skip a pure
  function or a one-class edit, and say why. Then it writes the intent down **before** the run (a
  trace read against nothing confirms whatever happened), runs the smallest real path, reads the
  value-free structural `.nt` against the intent, opens values on one span only, and reports what
  the trace showed — every claim citing a span id (`#1.3`). Its last steps **pin** the flow:
  approval mode on, the whole suite run, the `.received.nt` shown whole, one question, and the
  promotion only after your yes.
- **`narrativetrace-debug`** — starts from a symptom, not a change: reproduces it with tracing on,
  names by span id the first span where a value diverges **before** any code changes, narrows to
  that span's sub-tree by wrapping one more collaborator (never `@notTraced`, which redacts), fixes
  it in that span, checks the structural trace shows nothing else moved, and pins the reproduction
  as a regression test behind the same gate. A defect in NarrativeTrace itself goes to
  `narrativetrace-feedback` instead of being worked around.

They compose: a brand-new project starts with `add-narrative-tracing`; a project that already has
NarrativeTrace installed, where something isn't working, starts with `narrativetrace-doctor`.
Either path ends at the doctor — it owns diagnosis from there. `add-narrativetrace-clarity` owns
first naming reports and optional clarity enforcement; it does not install tracing or harvest a
glossary, and no doctor finding points at it, because nothing fails for want of a report.
`narrativetrace-feedback` is where a
path ends when the problem turns out to be ours rather than the project's — the doctor's own
closing rule points at it. A later skill will own generation (writing the redaction-proof test the
doctor can only ask you to add today).
`narrativetrace-verify` is where the next session starts once tracing works — the install skill's
last step hands over to it — and `narrativetrace-debug` is where a reported symptom starts. Both
render one shared "how to read a trace" section, so they never teach two ways to read one file.

## Installing them

- **`npx @narrativetrace/cli init`** — the fastest path, for any project: previews the plan and a
  unified diff (`--dry-run`, writes nothing), then applies exactly what the preview showed. It
  copies all six skills into `.agents/skills/` — and into `.claude/skills/` where the project is one
  of that vendor's — and writes one marked section into `AGENTS.md`; a `CLAUDE.md` that is already
  there gets one `@AGENTS.md` line, none created. Re-run it any time to refresh: there is no build
  hook, and a re-run rewrites only the pages and section it owns. See
  [`@narrativetrace/cli`](../packages/cli/README.md#narrativetrace-init) for every flag; the preview
  against an empty project is shown below.
- **Copying the rendered files by hand** stays the fallback — the same paths `init` writes, with
  no provenance line and no `AGENTS.md` section update on your own. **Claude Code**: rendered
  `SKILL.md` files live at
  [`.claude/skills/add-narrative-tracing/`](../.claude/skills/add-narrative-tracing/SKILL.md) and
  [`.claude/skills/narrativetrace-doctor/`](../.claude/skills/narrativetrace-doctor/SKILL.md) and
  [`.claude/skills/narrativetrace-feedback/`](../.claude/skills/narrativetrace-feedback/SKILL.md) and
  [`.claude/skills/add-narrativetrace-clarity/`](../.claude/skills/add-narrativetrace-clarity/SKILL.md) and
  [`.claude/skills/narrativetrace-verify/`](../.claude/skills/narrativetrace-verify/SKILL.md) and
  [`.claude/skills/narrativetrace-debug/`](../.claude/skills/narrativetrace-debug/SKILL.md) in
  this repository, each directory named after its skill's canonical name — Claude's plugin prefix
  is the only place a shortened segment is legitimate, and nothing in this repository is a plugin.
  Copy any of them into your own project's `.claude/skills/<name>/` and Claude picks it up on
  its own, invokable by name (`add-narrative-tracing` / `narrativetrace-doctor` / `narrativetrace-feedback` / `add-narrativetrace-clarity` / `narrativetrace-verify` / `narrativetrace-debug`) directly.
  **Codex**: rendered `SKILL.md` files also live at
  [`.agents/skills/add-narrative-tracing/`](../.agents/skills/add-narrative-tracing/SKILL.md) and
  [`.agents/skills/narrativetrace-doctor/`](../.agents/skills/narrativetrace-doctor/SKILL.md) and
  [`.agents/skills/narrativetrace-feedback/`](../.agents/skills/narrativetrace-feedback/SKILL.md) and
  [`.agents/skills/add-narrativetrace-clarity/`](../.agents/skills/add-narrativetrace-clarity/SKILL.md) and
  [`.agents/skills/narrativetrace-verify/`](../.agents/skills/narrativetrace-verify/SKILL.md) and
  [`.agents/skills/narrativetrace-debug/`](../.agents/skills/narrativetrace-debug/SKILL.md) — the
  layout the Codex CLI discovers on its own, walking from the working directory up to the repo
  root (and also `~/.agents/skills` for user-global skills). Its frontmatter is a strict subset of
  Claude's plugin frontmatter (`name` and `description` only — no `when_to_use`, no
  `allowed-tools`), so the identical page body ships under both layouts. Source:
  developers.openai.com/codex/skills and developers.openai.com/codex/concepts/customization
  (fetched 2026-09-13).
- **Any agent, any platform**: every agent that reads `AGENTS.md` sees the always-on pointer this
  repository's own `AGENTS.md` carries between its `<!-- narrativetrace:skills:start -->` markers
  — all six skills' names and descriptions, so an agent that never thought to look still knows they
  exist.
- **Gemini** is on the roadmap but not built yet.

A `--dry-run --json` preview against an empty project looks like this:

<!-- snippet: packages/cli/narrativetrace-output/init-preview.json -->
```json
{
  "carrier": "@narrativetrace/skills@0.3.0",
  "actions": [
    {
      "kind": "create",
      "path": ".agents/skills/narrativetrace-doctor/SKILL.md",
      "status": "planned"
    },
    {
      "kind": "create",
      "path": ".agents/skills/add-narrative-tracing/SKILL.md",
      "status": "planned"
    },
    {
      "kind": "create",
      "path": ".agents/skills/narrativetrace-feedback/SKILL.md",
      "status": "planned"
    },
    {
      "kind": "create",
      "path": ".agents/skills/add-narrativetrace-clarity/SKILL.md",
      "status": "planned"
    },
    {
      "kind": "create",
      "path": ".agents/skills/narrativetrace-verify/SKILL.md",
      "status": "planned"
    },
    {
      "kind": "create",
      "path": ".agents/skills/narrativetrace-debug/SKILL.md",
      "status": "planned"
    },
    {
      "kind": "create",
      "path": "AGENTS.md",
      "status": "planned"
    }
  ],
  "exitCode": 0
}
```
<!-- /snippet -->

## From a registry

A project can carry these skills without anyone here ever running the installer, in one of three
states:

1. **Installed by `init`** — committed, the team's. The only state `config.skills-installed`
   passes: the pages carry the provenance line and match the release this project resolves.
2. **A personal install from a registry** (a Claude Code plugin cache) — yours only. Invisible to
   the doctor by design: it diagnoses the project, and a personal install reaches no teammate and
   no other agent.
3. **A registry install into the project** (`npx skills add`) — this repository's own rendered
   pages, landed by a registry rather than by `init`, so they carry no provenance line yet.

Trying the skills yourself, without touching the project:

```text
/plugin marketplace add narrativetrace/narrativetrace-typescript
/plugin install narrativetrace-typescript@narrativetrace-typescript
```

then run `npx @narrativetrace/cli init --dry-run`, read the diff, and run it without the flag so
`AGENTS.md` points at them.

Installing into the project from the open-standard registry:

```text
npx skills add narrativetrace/narrativetrace-typescript
```

then run `npx @narrativetrace/cli init --dry-run`, read the diff, and run it without the flag so
`AGENTS.md` points at them.

A page a registry left behind is never refused just for being there. `init` compares it byte for
byte, with only the line ending normalised, against what it would have rendered itself. One
identical to this release's own page is **adopted** — the plan says so, rather than "replaced",
because a person reading it has to know that nothing of theirs was overwritten. This is the
plan's own text, quoted, never retyped here:

<!-- snippet: packages/tooling/src/init/plan-renderer.ts region=adoptedNote -->
```ts
const ADOPTED = "adopted: identical to this carrier's page, so only the provenance line is added";
```
<!-- /snippet -->

A page that differs — another release, or hand-edited — keeps the ordinary refusal `--force` is
for. `npx skills add` also leaves `.claude/skills/<name>` a symbolic link to the open-standard
page; `init` never writes through a link like that one. A link whose target it would adopt or
already owns is replaced with a real directory holding the right flavour; every other link is
refused, because `--force` covers content, never a link.

And this is the doctor's own fix, quoted the same way, for a project where the pages are there but
carry none of this:

<!-- snippet: packages/tooling/src/doctor/checks/skills-installed.ts region=registryMessages -->
```ts
const INIT_DRY_RUN = "npx --yes @narrativetrace/cli init --dry-run";
const NOT_OURS = " (there, but not ours)";

/**
 * What a page with no provenance line most often IS: a registry install (design D5 state 3) — `npx
 * skills add`, or a plugin or workspace install — of this repository's own rendered pages. Naming the
 * case matters because the obvious reading of "not ours" is "somebody else's work", which invites a
 * `--force` nobody needs: `init` ADOPTS a page identical to this release's.
 */
const FROM_A_REGISTRY =
  " Pages that are there without our line usually came from a registry (npx skills add, a plugin" +
  " or workspace install). A page identical to this release's is adopted, and no --force is needed.";
```
<!-- /snippet -->

## How they're built

No skill is ever hand-edited.
`packages/skills-catalogue/src/catalogue/add-narrative-tracing.ts`,
`packages/skills-catalogue/src/catalogue/narrativetrace-doctor.ts`,
`packages/skills-catalogue/src/catalogue/narrativetrace-feedback.ts`,
`packages/skills-catalogue/src/catalogue/add-narrativetrace-clarity.ts`,
`packages/skills-catalogue/src/catalogue/narrativetrace-verify.ts` and
`packages/skills-catalogue/src/catalogue/narrativetrace-debug.ts` are the six sources of truth (the
reading section, the approval gate and the pin the last three share are written once, beside them);
`pnpm run skills-render` regenerates every skill's `.claude/skills/` and `.agents/skills/` pages
and this repository's own `AGENTS.md` section from them, and `pnpm run skills-check` (wired into
`pnpm run check`) fails the build the moment any rendered page drifts from the typed source. Every code
block a rendered page shows is embedded from real, tested source through the same
`<!-- snippet: -->` marker convention this repository's other docs use — never a hand-typed
example. A Tier A lint keeps private planning-note citations out of the pages: rationale sentences
ship, the citation naming the note does not. A second lint guards the one piece of frontmatter whose
absence is a feature: a skill whose steps can make something public — today,
`narrativetrace-feedback` — must declare no `allowed-tools`, because that field pre-approves its
listed tools for the turn that loads the skill, and a reporting skill that pre-approved its own
reporting command would stop the harness asking exactly where asking is the point. A third lint
holds the same line for the two skills that promote an approval baseline (`narrativetrace-verify`,
`narrativetrace-debug`): a skill that runs the approve command declares no allowed tool at all.

## See also

- [`@narrativetrace/cli`](../packages/cli/README.md) — the `doctor` command `narrativetrace-doctor` runs, and the `feedback` command `narrativetrace-feedback` drives
- [Sixty Seconds](sixty-seconds.md) — the install-and-first-trace walkthrough `add-narrative-tracing`'s steps are drawn from
- [What to Commit](what-to-commit.md) — the approval-trace state the doctor's fourth step checks
