# Sporadic eval quota

The cheaper Tier B lanes (Codex, Antigravity, Cursor) run under the sporadic policy in `evals/README.md`:
never scheduled, promotion points only, quota-guarded. `run.ts` reads this file before every
codex/antigravity/cursor trial and refuses to start once the current ISO week's spend reaches the
platform's weekly allowance below — **there is no override flag**; raise the number here instead. A
lane whose allowance is **0** is the owner's own "the CLI is not installed or signed in yet": it
prints one `SKIP:` line naming its tool and runs nothing, and the run exits green. The Claude
lane is not sporadic (it runs on the harness's own regular cadence) and carries no quota row.

## Allowance

Owner-ruled 2026-09-13 (skill-evals-multi-platform-2026-09-13.md): Codex is available now
on the basic plan at the default sporadic-lane allowance. Antigravity replaced the Gemini CLI lane
on 2026-10-10 (owner: "use Antigravity instead of Gemini CLI", Java repo ruling, mirrored here); its
`agy` CLI is installed and signed in on the owner's workstation, so it carries the same default
allowance as Codex. Cursor (Phase 8, platform pointers and evidence, 2026-10-10) starts at 0: its
headless CLI is `agent`, skipping every trial until it is installed and signed in.

| platform | plan tier | weekly allowance |
|---|---|---|
| codex | basic | 4 |
| antigravity | subscription | 4 |
| cursor | not installed | 0 |

## Spend log

Appended by the runner (`evals/run.ts`), one row per sporadic-lane (codex/antigravity/cursor) trial —
Claude-lane trials never append here. `week` is the ISO 8601 week (`isoWeek()` in `evals/quota.ts`)
the trial's own date falls in, so a week boundary crossing mid-run is judged the same way twice.

| date | platform | skill | case | week |
|---|---|---|---|---|
| 2026-09-14T08:35:11.963Z | codex | narrativetrace-doctor | happy-path | 2026-W38 |
| 2026-09-14T08:40:56.096Z | codex | narrativetrace-doctor | happy-path | 2026-W38 |
