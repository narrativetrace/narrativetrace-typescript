# Fixture: existing-service-vitest

`existing-service` with a `vitest run` test suite instead of `node --test`, and **no NarrativeTrace
anywhere**: one real service boundary (`InvoiceService.issueInvoice`), a `main.js` that runs it, two
passing tests on a runner this runtime ships a test integration for.

It exists for `add-narrative-tracing/existing-service` (B-92): the install page's first trace for a
project WITH tests is one existing test run through the test integration, which leaves `.md` and
`.nt` files. `existing-service` cannot serve that case (its runner is `node:test`, which has no
integration — the page's third premise), and `existing-service-checkout` already has NarrativeTrace
installed, so it cannot be the start of an *add* case. Not a workspace member; the harness
scaffolds it into a scratch directory.
