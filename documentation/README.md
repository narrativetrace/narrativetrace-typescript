# NarrativeTrace documentation

[English](README.md) | [Español](LEAME.md) | [Português](LEIAME.md) | [简体中文](自述文件.md)

The canonical index of every user guide, English and translated alike. See the root
[README](../README.md) for the product pitch; this page is the documentation set on its own.
Translated indexes appear here once a language ships one (`documentation/i18n/manifest.json` tracks
progress; the translation platform's conventions govern how each stays in sync).

Start here:

- [See a trace in 60 seconds](sixty-seconds.md) — a plain script wraps one service, one run, the trace in your terminal
- [Installation Guide](installation-guide.md) — dependencies, every integration path, trace output setup
- [Choosing an Integration](choosing-an-integration.md) — which package you need, as a decision diagram
- [Configuration Guide](configuration-guide.md) — tracing levels, Vitest config, render options
- [Decorators Guide](decorators-guide.md) — `@traced`, `@narrated`, `@onError`, `@notTraced`

Going deeper:

- [Privacy and Redaction](privacy-and-redaction.md) — the row-by-row redaction contract, verified against the code
- [Structural Trace Format](structural-trace-format.md) — the value-free `.nt` artifact, per-invocation identity, and approval traces end to end
- [What to Commit](what-to-commit.md) — which generated files are run output and which (if any) are reviewed baselines
- [Troubleshooting](troubleshooting.md) — symptom → cause → fix for the failure modes people actually hit
- [Agent Skills](agent-skills.md) — `add-narrative-tracing`, `narrativetrace-doctor` (a thin, read-only agent skill over `npx @narrativetrace/cli doctor`), `add-narrativetrace-clarity`, `narrativetrace-feedback`, `narrativetrace-verify`, `narrativetrace-debug` and `narrativetrace-explain`
- [Use NarrativeTrace with your agent](use-with-your-agent.md) — Cursor, Replit, Antigravity, GitHub Copilot and Claude Code: how each gets the skills, the pointer file `init` writes for it, and the evidence behind each row
- [Clarity Guide](clarity-guide.md) — scoring model, NLP components, static scanner
- [Framework Integration Guide](framework-integration-guide.md) — Express, Hono, browser, AsyncLocalStorage
- [Examples Guide](examples-guide.md) — the `pnpm demo` launcher and the runnable examples
- [Feature Guide](feature-guide.md) — canonical catalog of what this runtime ships, with tier and status

Recipes — one page per problem, in the words a user would type; each carries its scenario's code and the real output of a run this build performs:

- [Add logging to this service](recipes/add-logging-to-this-service.md) — a checkout with no log statement, every call in the project's own pino logger
- [Help me debug and fix this bug](recipes/help-me-debug-and-fix-this-bug.md) — a declined card leaves the stock reserved: find the missing `release`, fix it, pin it
- [Why did this test fail](recipes/why-did-this-test-fail.md) — a red test read span by span against its assertion
- [Review a complex flow before changing it](recipes/review-a-complex-flow-before-changing-it.md) — one run at `detail` and at `summary`, the log beside the value-free `.nt`
- [Review a refactoring: did behaviour change](recipes/review-a-refactoring-did-behaviour-change.md) — the tests stay green, the approval diff names the dropped call
- [Follow one request across services](recipes/follow-one-request-across-services.md) — the checkout calls a second traced service over HTTP: one trace id in both services' lines
- [Keep secrets out of the logs](recipes/keep-secrets-out-of-the-logs.md) — a password caught by name, a card number caught by value, and the test that proves it
- [Follow a flow across threads](recipes/follow-a-flow-across-threads.md) — a fork-join keeps the trace id; the same work handed to a worker without it starts a new trace
- [Send traces to the observability stack you already run](recipes/send-traces-to-the-observability-stack-you-already-run.md) — the log lines beside the OpenTelemetry spans of one run
- [Trace in production without the cost](recipes/trace-in-production-without-the-cost.md) — the tracing level in practice: `errors` keeps the failed run and writes nothing for a successful one

Gates and tooling (process/contributor content — English only, no translated mirror):

- [The Contract Gate](contract-gate.md) — `documentation/contract.yaml`, proving a documented
  default or config shape true of a real, published install
- [Duplication Detection](duplication.md) — the structural-duplication ratchet `pnpm run check` enforces
