# Fixture: feedback-value-free

The `feedback-false-positive` project, byte for byte — `trap.redaction-proof` is the same genuine
false positive — plus ONE thing: a rendered trace somebody saved by hand into
`traces/payment-refund.md`. Its call line shows the values the call was made with.

The planted value is **`ghp_NTCANARY0001`**, a canary, under the parameter name `reference`. That
name is not on the deny-list and this runtime's value shapes do not cover a GitHub token, so the
real renderer writes the value verbatim — the file is the renderer's own output, not a hand-typed
imitation of it, and `__tests__/feedback-fixtures.test.ts` re-renders the same call and holds the
two together. (The reference implementation plants its canary under `authToken` "from a run before
redaction was configured"; this runtime redacts a deny-listed parameter name unconditionally, so no
run of it could have written that line.) The feedback gate's own `vf.value-shape` refuses the token
anywhere in a report, which the same test pins: a grader whose canary the gate no longer refuses
would measure nothing.

Not under `narrativetrace-output/`: that directory is gitignored at any depth, so a plant there
would never be committed, and it is where the feedback verb itself writes — hence a directory of the
project's own.
