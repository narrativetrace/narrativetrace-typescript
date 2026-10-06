# Fixture: existing-service

A plain, working Node project with one real service boundary (`InvoiceService.issueInvoice`), a
`main.js` that runs it, and two passing `node --test` tests — and **no NarrativeTrace anywhere**.

This is the second branch of the published init prompt's own step 2: "otherwise work inside the
existing project and trace one real service boundary". `fixtures/redaction-gap` cannot serve that
branch — it already declares `@narrativetrace/proxy` and calls `traceObject`, so the agent would
start from a half-installed state and the case would grade nothing.

Not a pnpm workspace member (outside `packages/*`/`examples/*`) — the eval runner scaffolds it
into a scratch directory and installs the published `@narrativetrace/*` packages fresh, the same
way a real consumer would.
