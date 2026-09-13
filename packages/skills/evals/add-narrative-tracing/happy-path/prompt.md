# Case: happy-path

**Fixture:** `evals/fixtures/empty-project` (a cold install from an empty directory, harness §6
Q5), scaffolded into a scratch copy with nothing installed yet.

**Task prompt** (given to the agent, catalogue loaded):

> This is a brand new Node project. I want to add NarrativeTrace and see a trace from a real
> method call within the next few minutes.

**Expected trajectory:** the agent recognizes the trigger, loads `add-narrative-tracing`, sets
`"type": "module"` before installing (the documented trap — otherwise the first-trace snippet
throws `SyntaxError: Cannot use import statement outside a module`), installs
`@narrativetrace/core-node` and `@narrativetrace/proxy` with the project's real package manager,
wraps a class with `traceObject`, runs it, and shows the rendered trace — then runs
`npx narrativetrace doctor` and reports its findings rather than declaring success unprompted.

**Grading** (§11.1 split):
- **Gates** (every model): `graders/verify.sh` — `package.json` declares `"type": "module"`, at
  least one rendered `.md` trace exists under `narrativetrace-output`, and every `toolchain.*`
  doctor finding holds.
- **Report-only** (cheapest model), gates (mid model+): did the agent run the final
  `narrativetrace doctor` seam step and read its report, rather than declaring the project done
  unprompted?
