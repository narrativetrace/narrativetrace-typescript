# Fixture: redaction-gap

A deliberately incomplete project: `traceObject` wraps a call carrying a deny-listed parameter
name (`paymentToken`) and there is no test asserting `[REDACTED]` anywhere. `narrativetrace doctor`
must report `trap.redaction-proof` failing; the deviation case (`../../narrativetrace-doctor/
deviation-redaction-gap/`) checks that the skill correctly surfaces this and tells the agent what
to do about it, rather than assuming redaction "just works" because the parameter name is
suggestive.

Not a pnpm workspace member (outside `packages/*`/`examples/*`) — the eval runner scaffolds it
into a scratch directory and installs the published `@narrativetrace/*` packages fresh, the same
way a real consumer would.
