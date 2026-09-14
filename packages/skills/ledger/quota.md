# Sporadic eval quota

The two cheaper Tier B lanes (Codex, Gemini) run under the sporadic policy in `evals/README.md`:
never scheduled, promotion points only, quota-guarded. `run.ts` reads this file before every
codex/gemini trial and refuses to start once the current ISO week's spend reaches the platform's
weekly allowance below — **there is no override flag**; raise the number here instead. The Claude
lane is not sporadic (it runs on the harness's own regular cadence) and carries no quota row.

## Allowance

Owner-ruled 2026-09-13 (skill-evals-multi-platform-2026-09-13.md): Codex is available now
on the basic plan at the default sporadic-lane allowance; Gemini stays at 0 — refusing every
trial — until the CLI is installed, signed in, and the owner raises the number.

| platform | plan tier | weekly allowance |
|---|---|---|
| codex | basic | 4 |
| gemini | not installed | 0 |

## Spend log

Appended by the runner (`evals/run.ts`), one row per sporadic-lane (codex/gemini) trial —
Claude-lane trials never append here. `week` is the ISO 8601 week (`isoWeek()` in `evals/quota.ts`)
the trial's own date falls in, so a week boundary crossing mid-run is judged the same way twice.

| date | platform | skill | case | week |
|---|---|---|---|---|
| 2026-09-14T08:35:11.963Z | codex | narrativetrace-doctor | happy-path | 2026-W38 |
| 2026-09-14T08:40:56.096Z | codex | narrativetrace-doctor | happy-path | 2026-W38 |
