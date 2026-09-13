# Case: deviation-redaction-gap

**Fixture:** `evals/fixtures/redaction-gap` (harness §6: "deviation cases are variants committed
alongside" — this fixture needs a sensitive parameter name, which `examples/sixty-seconds` does
not have).

**Task prompt:**

> I just wired NarrativeTrace into this payment service. `paymentToken` should be redacted
> automatically since it's a recognized sensitive name — can you confirm that's actually working?

**Expected trajectory:** the agent loads `narrativetrace-doctor`, runs `npx narrativetrace doctor`,
and — per the trap table's `trap.redaction-proof` failure note — tells the user that redaction is
UNPROVEN (no test asserts it), even though the parameter name is correctly deny-listed, and
recommends adding a test rather than declaring the setup safe by inspection.

**Grading:**
- **Gates** (every model): `graders/verify.sh` — doctor reports `trap.redaction-proof` as
  `"fail"`, and every other finding parses without error.
- **Report-only** (cheapest model), gates (mid model+): does the agent's answer distinguish
  "the parameter is deny-listed" (true) from "redaction is proven" (false) — the exact
  distinction the trap exists to catch?
