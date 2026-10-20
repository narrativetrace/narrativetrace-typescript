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
wraps a class with `traceObject`, runs it, and shows the rendered trace on the console (the project has
no tests, so the page's standalone script prints the trace and writes no file — and the agent adds no
test runner) — then runs
`npx @narrativetrace/cli doctor` and reports its findings rather than declaring success unprompted.

**Grading** (§11.1 split):
- **Gates** (every model): `graders/verify.sh` — `package.json` declares `"type": "module"` and the
  two NarrativeTrace packages; the grader itself runs the program the agent left (the `start`
  script, else `main`, else `index.js`/`index.mjs`, read from the files) and asserts exit 0 and a
  rendered trace line `<Class>.<method>(` in its output; and every `toolchain.*` doctor finding
  holds. No `.md` file is asserted: this project has no tests, so nothing is written to disk (B-92;
  the sibling `existing-service` case grades the files).
- **Report-only** (cheapest model), gates (mid model+): did the agent run the final
  `narrativetrace doctor` seam step and read its report, rather than declaring the project done
  unprompted?
