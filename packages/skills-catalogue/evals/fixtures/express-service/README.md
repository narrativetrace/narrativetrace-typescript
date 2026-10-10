# Fixture: express-service

A plain, working Express API with one real service boundary (`OrderService.placeOrder`), a
`main.js` that starts it, places two orders against it the way a client would and shuts down, and
two passing `node --test` tests — and **no NarrativeTrace anywhere**.

The project Phase 6's Tier B case (`add-narrative-tracing/init-prompt-express-project`) starts
from: the published init prompt, on an existing project of this runtime's main web framework. A
correct run leaves `@narrativetrace/express` installed and `narrativeTrace(…)` wired as Express
middleware — the doctor's `config.express-middleware` check, whose fix the `add-narrative-tracing`
skill's framework step applies — so each request the program makes prints its own trace.

Not a pnpm workspace member. The case's `"setup": "checkout-registry"` installs `express` and
serves THIS checkout's `@narrativetrace/*` packages from a local registry, so every NarrativeTrace
package the agent installs is this checkout's.
