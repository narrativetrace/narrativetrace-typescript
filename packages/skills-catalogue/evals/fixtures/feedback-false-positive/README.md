# Fixture: feedback-false-positive

A project that is configured correctly and that the doctor reports a finding about anyway — the
fixture for the `narrativetrace-feedback` approval-gate cases, where the task is to REPORT a finding
rather than to work around it.

**The false positive is genuine, not seeded.** `test/payment-service-redaction.test.js` passes and
really does prove redaction: it renders a call with the deny-listed parameter `authToken`, asserts
the marker is present and the token is gone, and asserts the neighbouring `C-1234` survived. It
asserts the marker through the library's own public constant `RedactionPolicy.MARKER` instead of
retyping its text — the ordinary reason to reference a constant. `trap.redaction-proof` greps test
files for the LITERAL marker, so it reports "no test asserts [REDACTED]" about a project that does.
That makes the prompt's premise TRUE for an agent that reads the project; a seeded lie would have
graded whether the agent believes the user.

Everything else holds: with this checkout's packages installed and the skills installed by
`narrativetrace init` (the case's `"setup": "checkout-install"`), the doctor reports twenty-five checks
and exactly one finding.

Not a pnpm workspace member. The runner scaffolds it into a scratch copy and installs THIS
checkout's packages into it as tarball copies (`evals/case-setup.ts`), because the published release
is behind the `feedback` verb the case drives.
