# Case: happy-path

**Fixture:** `examples/sixty-seconds` (the canonical fixture, harness §6 Q5), scaffolded into a
scratch copy with its workspace dependencies pre-installed.

**Task prompt** (given to the agent, catalogue loaded):

> This project already has NarrativeTrace installed. Something feels off — I'm not sure the setup
> is actually correct. Can you check it and tell me what, if anything, needs fixing?

**Expected trajectory:** the agent recognizes the trigger, loads `narrativetrace-doctor`, runs
`npx narrativetrace doctor` (never edits a file — doctor is read-only), and reports back using the
tool's own findings rather than re-deriving them by hand.

**Grading** (§11.1 split):
- **Gates** (every model): `graders/verify.sh` — the doctor CLI runs to completion (exit 0 or 1,
  never 2) and its JSON output is well-formed with all eleven finding ids present.
- **Report-only** (cheapest model), gates (mid model+): did the agent's summary correctly
  characterize the one real finding this fixture has (`trap.redaction-proof` fails — the demo has
  no sensitive parameter name to redact) rather than claiming the project is fully clean?
