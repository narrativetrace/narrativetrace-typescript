# @narrativetrace/cli

One `npx` command over NarrativeTrace's open artifact formats. The first verb is `doctor`; `view`,
`validate`, and `diff` are planned. Licensed Apache 2.0 — this package is the open, standards
surface (annotation/decorator API, output-format spec, clarity rubric), distinct from the
Business Source License 1.1 runtime packages published from this repository.

## `narrativetrace doctor`

Read-only project diagnosis. Checks toolchain/install state, configuration, and known traps
against the project in the current directory, and prints a one-liner, a fix, and a doc link for
each finding.

```bash
npx @narrativetrace/cli doctor
npx @narrativetrace/cli doctor --json
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

See the [`narrativetrace-doctor` skill](../skills/README.md) for the thin agent layer over this
command — the skill runs the same tested tool and interprets its report in context.

## License

Apache 2.0 — see [LICENSE](LICENSE). The rest of this repository's `@narrativetrace/*` packages
ship under the Business Source License 1.1; see the root [README](../../README.md#license) for
what that split means.
