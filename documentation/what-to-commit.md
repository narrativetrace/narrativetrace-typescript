# What to commit

NarrativeTrace writes files that describe one test run, by default — a suite
using `createNarrativeTest` needs nothing configured to get them. None of
them are a reviewed, hand-authored contract the way an approval baseline is
on some other NarrativeTrace runtimes — this runtime has not shipped
structural/approval testing yet (tracked for a future release). Everything
below is generated output, with one exception.

| Artifact | Commit? | Why |
|---|---|---|
| `narrativetrace-output/**/*.md` | No | Regenerated every run |
| `narrativetrace-output/**/*.json` | No | Same trace as structured JSON — regenerated every run |
| `narrativetrace-output/**/*.canonical.json` | No | The schema-versioned canonical export — regenerated every run |
| `narrativetrace-output/diagrams/**/*.mmd` / `*.puml` | No | Regenerated every run |
| `narrativetrace-output/**/*.clarity-json` | No | Per-scenario clarity scores — regenerated every run |
| `narrativetrace-output/clarity-report.md` / `clarity-results.json` | No | The suite-wide aggregate (via `ClaritySuiteReporter`) — a generated report, not a decision |
| `glossary.json` / `glossary.md` | **Yes**, if glossary harvesting is used | Committed at the repository root once harvested; the committed file is what clarity scoring and vocabulary checks read back on every subsequent run — "one file, one review workflow" |

Everything under `narrativetrace-output/` is output. Add it to `.gitignore`
if you have not already:

```gitignore
narrativetrace-output/
```

A CI job that wants the console narrative and clarity/glossary metadata but
none of these files can set `NARRATIVETRACE_OUTPUT=false` — see the
[Configuration Guide](configuration-guide.md#2-vitest-configuration).

## The rule in one sentence

If a file only exists because a test ran, it is output — do not commit it.
`glossary.json` is the one file in this list a human is expected to review
before it lands: harvesting proposes additions, but committing them is the
approval (see the [Clarity Guide](clarity-guide.md) and
[Feature Guide § Improve the code](feature-guide.md#improve-the-code-clarity-diagnostics)).

## Why there is no `.approved.nt` row here yet

Some NarrativeTrace runtimes also ship a value-free structural artifact and an
approval workflow — a committed baseline that fails the build when a
scenario's *shape* changes, reviewed and promoted deliberately. This runtime
has not built that yet. Until it does, the closest thing to a reviewed
contract you have today is a normal assertion in your test, plus whatever
the clarity gate enforces on naming. If you want the structural-diff
workflow today, treat the JSON export (`exportJson`/`.canonical.json`) as
your own input to a snapshot-testing tool of your choice — it is
deterministic for a context-free capture, so a snapshot comparison behaves
reasonably, but NarrativeTrace itself does not manage that baseline for you
yet.
