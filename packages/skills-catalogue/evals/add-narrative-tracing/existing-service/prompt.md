# Case: existing-service

**Fixture:** `evals/fixtures/existing-service-vitest` (a working service with a `vitest run` suite
and no NarrativeTrace), scaffolded into a scratch copy with nothing installed yet; the catalogue is delivered by this
checkout's `narrativetrace init`, the packages come from the registry.

**Task prompt** (given to the agent, catalogue loaded):

> This service already has a test suite. Add NarrativeTrace and show me the trace of one of my
> existing tests — I want to find the file afterwards, not just see it scroll by.

**Expected trajectory:** the agent loads `add-narrative-tracing`, installs the NarrativeTrace
packages and the test integration the doctor names for the project's runner, takes the page's tests
branch for its first trace — one existing test run through the integration with output on, no demo
file, no new test runner — prints the rendered `.md`, then runs `npx @narrativetrace/cli doctor`
and reports it.

**Grading** (§11.1 split):
- **Gates** (every model): `graders/verify.sh` — `@narrativetrace/proxy` and the test integration `@narrativetrace/vitest` are declared; the
  grader itself runs the project's `test` script and asserts exit 0; at least one `.md` AND one
  `.nt` file exist under `narrativetrace-output/`; the fixture's own service and test files are
  still there; every `toolchain.*` doctor finding holds.
- **Report-only** (cheapest model), gates (mid model+): did the agent read the written file back
  to the user rather than only the console copy?
