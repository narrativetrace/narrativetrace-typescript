# @narrativetrace/tooling

The library the `narrativetrace` command line is a launcher over: the doctor's read-only project
checks, and the installer that copies NarrativeTrace's agent skills into a project. Licensed
Apache 2.0 — this package is part of the open, standards surface, distinct from the Business
Source License 1.1 runtime packages published from this repository.

Nothing here is a command. `@narrativetrace/cli` owns argument parsing, exit codes and the
process bindings; this package owns the decisions, so both a CLI and any other host can reach
them in-process.

**Dependencies: none.** Node's built-ins only — no runtime dependency on any other
`@narrativetrace/*` package, which is what lets a consumer install the CLI without pulling the
tracing runtime in behind it. The repository's architecture test enforces it.

## The doctor

```ts
import { buildSnapshot, renderHuman, runDoctor } from "@narrativetrace/tooling";

const report = runDoctor(buildSnapshot(process.cwd(), process.env));
console.log(renderHuman(report));
```

`buildSnapshot` is the one impure step: it reads the project once — `package.json`, resolvable
`node_modules` packages, source and test files, rendered output, the approved-trace directory —
and every check is a pure function over that snapshot. Zero network. See
[`@narrativetrace/cli`](../cli/README.md) for the check table and the exit codes.

## The installer

Copies the rendered skill pages a carrier ships (`@narrativetrace/skills`, or the copy bundled in
the CLI) into a consumer project, and keeps a marked section in its `AGENTS.md` current:

```ts
import {
  applyPlan,
  openCarrier,
  planInstall,
  readProjectState,
  renderPlan,
} from "@narrativetrace/tooling";

const carrier = openCarrier({ projectDirectory: process.cwd() });
const plan = planInstall(readProjectState(process.cwd()), carrier, { dryRun: true });
console.log(renderPlan(plan, { json: false })); // a summary and a unified diff
```

Planning is pure and complete: a plan carries every file's whole text before and after, so the
diff a person reviews is exactly what `applyPlan` writes, and applying needs no second look at the
project. Anything the installer will not do — a skill directory somebody else owns, a context file
with two of our sections — is a `refuse` action inside the plan, reported rather than thrown, and
it never stops the rest of it.

## License

Apache 2.0 — see [LICENSE](LICENSE). The rest of this repository's `@narrativetrace/*` packages
ship under the Business Source License 1.1; see the root [README](../../README.md#license) for
what that split means.
