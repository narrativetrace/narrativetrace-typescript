# What to commit

NarrativeTrace writes files that describe one test run, by default — a suite
using `createNarrativeTest` needs nothing configured to get them. Most of
them are generated output, not a reviewed contract. The one deliberate
exception besides `glossary.json` is the approved trace (`.approved.nt`)
*(since 0.1.3, unreleased)* —
opt in with `approval: true` (see the
[Configuration Guide](configuration-guide.md#2-vitest-configuration)) and it
becomes a reviewed, hand-authored contract the same way an approval baseline
is on every other NarrativeTrace runtime.

| Artifact | Commit? | Why |
|---|---|---|
| `narrativetrace-output/**/*.md` | No | Regenerated every run |
| `narrativetrace-output/**/*.json` | No | Same trace as structured JSON — regenerated every run |
| `narrativetrace-output/**/*.canonical.json` | No | The schema-versioned canonical export — regenerated every run |
| `narrativetrace-output/diagrams/**/*.mmd` / `*.puml` | No | Regenerated every run |
| `narrativetrace-output/**/*.clarity-json` | No | Per-scenario clarity scores — regenerated every run |
| `narrativetrace-output/clarity-report.md` / `clarity-results.json` | No | The suite-wide aggregate (via `ClaritySuiteReporter`) — a generated report, not a decision |
| `narrativetrace-output/structural/**/*.nt` | No | The last-green *local* baseline the console delta and failure reports compare against — not the approved trace below |
| `narrativetrace-output/manifest.json` | No | Scenario → artifact index, plus the run's own `id`/`name` *(since 0.1.3, unreleased)* — regenerated every run |
| `<approvedDir>/**/*.approved.nt` | **Yes** | The reviewed approved trace (only exists once `approval: true` is set) — the one artifact in this list that is a deliberate decision, not output |
| `<approvedDir>/**/*.received.nt` | No | Written on an approval mismatch, or when no approved trace exists yet. Review it, run `pnpm run approve-narratives` (or `narrativetrace-approve`) to promote it, then delete or let the script remove it — never commit the received trace itself |
| `<approvedDir>/**/*.incomplete.nt` | No | Written instead of `.received.nt` when the run itself was incomplete (a shed event, or a refused async scope) — compared by subsequence containment, never promotable |
| `glossary.json` / `glossary.md` | **Yes**, if glossary harvesting is used | Committed at the repository root once harvested; the committed file is what clarity scoring and vocabulary checks read back on every subsequent run — "one file, one review workflow" |
| `.claude/skills/**/SKILL.md`, the `AGENTS.md` `<!-- narrativetrace:skills:* -->` section | **Yes** *(since 0.1.3, unreleased)* | Build output from `packages/skills`' typed catalogue (`pnpm run skills-render`), not test-run output — committed the same way `glossary.json` is: regenerated, reviewed in diffs, and checked against drift (`pnpm run skills-check`, wired into `pnpm run check`) rather than hand-edited |

Everything under `narrativetrace-output/` is output. Add it to `.gitignore`
if you have not already:

```gitignore
narrativetrace-output/
```

`<approvedDir>` (default `narratives/`) is not: `.approved.nt` files there
are meant to be tracked, but a `.received.nt`/`.incomplete.nt` sitting beside
one is not automatically excluded. Add an explicit ignore rule for those:

```gitignore
narratives/**/*.received.nt
narratives/**/*.incomplete.nt
```

A CI job that wants the console narrative and clarity/glossary metadata but
none of these files can set `NARRATIVETRACE_OUTPUT=false` — see the
[Configuration Guide](configuration-guide.md#2-vitest-configuration).

## The rule in one sentence

If a file only exists because a test ran, it is output — do not commit it.
If a file exists because a human reviewed and accepted it, it is a baseline —
commit it, and expect its diffs to be read in code review the same way a
snapshot test's diff would be. `glossary.json` and `.approved.nt` are the two
files in this list a human is expected to review before they land: harvesting
proposes glossary additions and a rejected structural change writes a
received trace, but committing either is the approval (see the
[Clarity Guide](clarity-guide.md),
[Feature Guide § Improve the code](feature-guide.md#improve-the-code-clarity-diagnostics),
and [Structural Trace Format](structural-trace-format.md) for the approval
loop end to end).
