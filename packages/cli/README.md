# @narrativetrace/cli

One `npx` command over NarrativeTrace's open artifact formats. Three verbs: `doctor` diagnoses a
project, `init` installs the NarrativeTrace agent skills into it, and `uninstall` removes exactly
what `init` wrote. `view`, `validate`, and `diff` are planned. Licensed Apache 2.0 — this package is
the open, standards surface (annotation/decorator API, output-format spec, clarity rubric), distinct
from the Business Source License 1.1 runtime packages published from this repository.

Every verb is zero-network and every flag follows the verb:

```bash
npx --yes @narrativetrace/cli doctor
npx --yes @narrativetrace/cli init --dry-run
npx --yes @narrativetrace/cli uninstall
```

`--yes` skips npm's "Ok to proceed?" prompt, which is a stall for an unattended agent. Keep the
flags after the verb: npm claims a flag that directly follows the package spec, so
`npx --dry-run @narrativetrace/cli init` would install for real.

## `narrativetrace doctor`

Read-only project diagnosis. Checks toolchain/install state, configuration, and known traps
against the project in the current directory, and prints a one-liner, a fix, and a doc link for
each finding.

```bash
npx --yes @narrativetrace/cli doctor
npx --yes @narrativetrace/cli doctor --json
```

Exit codes: `0` clean, `1` findings, `2` could not run. Zero network — every check reads only
files already on disk (`package.json`, resolvable `node_modules` packages, source/test files,
rendered `narrativetrace-output/`, and the approved-trace directory) plus the current environment.
Mutates nothing.

### Checks

| id | what it checks |
|---|---|
| `toolchain.node-engine` | the running Node satisfies the installed package's `engines.node` |
| `toolchain.vitest-peer` | the installed `vitest` satisfies `@narrativetrace/vitest`'s declared peer range |
| `toolchain.sibling-packages` | `@narrativetrace/vitest`'s sibling dependencies resolve from the consumer (pnpm's strict, non-hoisting layout) |
| `config.output-env` | `NARRATIVETRACE_OUTPUT`, if set, is `"true"` or `"false"` |
| `config.reporter-subpath` | a registered vitest reporter is imported from `@narrativetrace/vitest/reporters`, not the package root |
| `config.trace-object-keys` | no `traceObject(...)` method entry skips the per-method `{ params: [...] }` config object |
| `trap.silent-sink` | `traceObject()` usage has a consumer/sink attached somewhere |
| `trap.parameter-arg0` | rendered output has no `arg0`-style placeholder parameter names |
| `trap.redaction-proof` | a test asserts `[REDACTED]` for a deny-listed parameter name |
| `trap.approval-traces` | no stale `.received.nt` file sits next to an `.approved.nt` baseline |
| `trap.llms-before-you-start` | a plain `.js` file using ESM `import` has `"type": "module"` in `package.json` |
| `config.skills-installed` | the agent skills this project's carrier ships are installed under `.agents/skills/` and stamped with the release this project resolves |

See the [`narrativetrace-doctor` skill](../skills/README.md) for the thin agent layer over this
command — the skill runs the same tested tool and interprets its report in context.

The checks themselves live in [`@narrativetrace/tooling`](../tooling/README.md), a zero-dependency
library; this package is the launcher over it, so a host that is not a command line can run the
same checks in-process.

## `narrativetrace init`

Copies the NarrativeTrace agent skills into `.agents/skills/` — and into `.claude/skills/` where the
project is one of that vendor's — and writes one marked section into `AGENTS.md`, so an agent working
in the project finds the skills where its own convention says to look. A `CLAUDE.md` that is already
there gets one `@AGENTS.md` line; none is created.

```bash
npx --yes @narrativetrace/cli init --dry-run   # show the plan and the unified diff, write nothing
npx --yes @narrativetrace/cli init             # apply exactly what the preview showed
```

Read the diff first: the preview is computed from the same plan the apply executes, so what you read
is what gets written.

| flag | what it does |
|---|---|
| `--dry-run` | Print the plan and the unified diff. Writes nothing, always exits `0`. |
| `--write-existing` | Permission to touch an `AGENTS.md` or `CLAUDE.md` that is already there. |
| `--force` | Permission to overwrite a skill directory somebody else owns. |
| `--only skills\|agents-md` | One half of the install. Both halves by default. |
| `--vendor claude\|none` | Force the vendor flavour on or off. Detected from the project by default. |
| `--from <dir>` | Install from a carrier directory — a checked-out `@narrativetrace/skills`, or an unpacked tarball of one. The copy bundled in this package by default. |
| `--json` | The `{carrier, actions[{kind, path, status}], exitCode}` envelope instead of human text. |

Exit codes: `0` applied (or previewed), `1` something was refused, `2` could not run. A refusal names
the flag that would allow it and never stops the rest of the plan — one file that says no does not
cost a project the other nine.

Nothing is fetched. `init` installs from the carrier bundled in this package, from the
`@narrativetrace/skills` the project itself resolves, or from the directory `--from` names, in that
order. There is no build hook and nothing to schedule: **run `init` again to refresh.** On a project
that already carries the skills, a re-run rewrites only our own pages and our own marked section.

When the pages about to land belong to a different release than the project resolves — `npx` fetches
the latest CLI unless you keep it as a dev dependency — the run prints one note on stderr naming both
versions and the command that installs the matching pages. A note, never a refusal: an empty
directory has no release to match.

## `narrativetrace uninstall`

Removes exactly what `init` wrote: skill directories carrying its provenance line, the marked
section, and the one `@AGENTS.md` import line. Nothing beside it — a directory that still holds
somebody else's file is left alone and reported.

```bash
npx --yes @narrativetrace/cli uninstall --dry-run
npx --yes @narrativetrace/cli uninstall
```

Takes `--dry-run`, `--only`, `--json` and the same exit codes. It opens no carrier: what to remove is
read from the project itself.

## License

Apache 2.0 — see [LICENSE](LICENSE). The rest of this repository's `@narrativetrace/*` packages
ship under the Business Source License 1.1; see the root [README](../../README.md#license) for
what that split means.
